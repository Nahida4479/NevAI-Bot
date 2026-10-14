import { userMention } from 'discord.js';
import 'dotenv/config';
import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { debugging, debug_log_warn, debug_log_err, debug_log_success } from '../debug/debug.js';
import { styleText } from 'node:util';
import { exa_request, tools, formatSearchResult, search_images } from './exa_ai_search_logic.js';
import { infographicTool, infographicToolOpenAI, runInfographicTool } from './generate_images/tool.js';
import { callOllama, getOllamaModel } from './ollama/detect_ollama.js';

let groq = null; 
if (process.env.GROQ_API) {
    groq = new Groq({ apiKey: process.env.GROQ_API });
} else {
    const err = `GROQ_API not set - Groq models are not avaliable.`
    debugging(err)
}


//Free AI Models
const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
const groqModels = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"]
const HackClubModels = ['openai/gpt-6-luna'] 
const visionModel = ["qwen/qwen3.6-27b", "qwen/qwen3.8-27b"]
const openroute = ["openrouter/free"]

// Paid AI models
const anthropic_claude = ["claude-haiku-5-5"] 
const anthropic_image_model = 'claude-haiku-5-5'

const claudeTools = tools?.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters
}))

const openAITools = [...(tools ?? [])];
if (process.env.EXA_API && process.env.ANTHROPIC_API) openAITools.push(infographicToolOpenAI);

async function executeTool(name, input, ctx) {
    if (name === 'search_web') {
        const query = input.query || '';
        if (!query) return 'Missing query';
        ctx.usedInternetSearch = true;
        const [searchResult, imageResult] = await Promise.all([
            exa_request(query),
            search_images(query),
        ]);
        ctx.imageResult = imageResult;
        return formatSearchResult(searchResult);
    }
    if (name === 'create_infographic') {
        const result = await runInfographicTool(input, ctx.userId, ctx.language);
        if (result.png) ctx.infographicPng = result.png;
        return result.text;
    }
    return 'Unknown tool';
}


function newCtx(userId, language) {
    return { userId, language, usedInternetSearch: false, imageResult: undefined, infographicPng: null };
}

function toolOptions(lastRound) {
    if (!openAITools.length) return {};
    return { tools: openAITools, tool_choice: lastRound ? 'none' : 'auto' };
}

async function runToolLoop(sendRequest, messages, ctx) {
    const conversation = [...messages];
    let data;
    let message;

    for (let round = 0; round < 3; round++) {
        const lastRound = round === 2;
        data = await sendRequest(conversation, lastRound);
        if (!data?.choices?.length) {
            throw new Error(`No choices in response: ${JSON.stringify(data?.error ?? data).slice(0, 200)}`);
        }
        message = data.choices[0].message;

        if (!message.tool_calls?.length) break;

        conversation.push(message);
        for (const toolCall of message.tool_calls) {
            let input = {};
            try {
                input = JSON.parse(toolCall.function.arguments || '{}');
            } catch {
                debugging(`Bad tool arguments: ${toolCall.function.arguments}`);
            }
            const content = await executeTool(toolCall.function.name, input, ctx);
            conversation.push({ role: 'tool', tool_call_id: toolCall.id, content });
        }
    }
    return { data, message };
}

function buildResult(content, model, ctx) {
    return {
        content,
        model,
        usedInternetSearch: ctx.usedInternetSearch,
        imageResult: ctx.imageResult,
        infographicPng: ctx.infographicPng
    };
}

async function callAnthropic_claude(messages, { userId = 'unknown', language = 'English' } = {}) {
    for (const model of anthropic_claude) {
        let inputTokens = 0;
        let outputTokens = 0;
        const system = messages[0].content;
        const chat = messages.slice(1);
        while (chat.length && chat[0].role == "assistant") chat.shift();
        let searchedImageResult;
        let usedInternetSearch = false;
        let infographicPng = null;

        try {
            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API });
            const allTools = [...(claudeTools ?? [])];
            if (process.env.EXA_API) allTools.push(infographicTool);

            const conversation = [...chat];
            let response;

            for (let round = 0; round < 3; round++) {
                const lastRound = round === 2;
                response = await client.messages.create({
                    max_tokens: 2500,
                    system,
                    model,
                    tools: allTools,
                    tool_choice: lastRound ? { type: 'none' } : { type: 'auto' },
                    messages: conversation
                });
                inputTokens += response.usage.input_tokens;
                outputTokens += response.usage.output_tokens;

                if (response.stop_reason !== 'tool_use') break;

                const toolUses = response.content.filter(b => b.type === 'tool_use');
                const toolResults = [];

                for (const toolUse of toolUses) {
                    if (toolUse.name === 'search_web') {
                        usedInternetSearch = true;
                        const query = toolUse.input.query || '';
                        if (!query) {
                            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Missing query', is_error: true });
                            continue;
                        }
                        const [searchResult, imageResult] = await Promise.all([
                            exa_request(query),
                            search_images(query),
                        ]);
                        searchedImageResult = imageResult;
                        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: formatSearchResult(searchResult) });

                    } else if (toolUse.name === 'create_infographic') {
                        const result = await runInfographicTool(toolUse.input, userId, language);
                        if (result.png) infographicPng = result.png;
                        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result.text });

                    } else {
                        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Unknown tool', is_error: true });
                    }
                }

                conversation.push({ role: 'assistant', content: response.content });
                conversation.push({ role: 'user', content: toolResults });
            }

            const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
            console.log(styleText(['greenBright', 'bold'], `ANTHROPIC_API: ${model}`), styleText(['bgYellow', 'bold'], `Input Tokens: ${inputTokens} | Output Tokens: ${outputTokens}`));
            return { content: text, model, usedInternetSearch, imageResult: searchedImageResult, infographicPng };
        } catch (err) {
            debug_log_err(`Anthropic model ${model} failed, ${err}`);
        }
    }
    throw new Error("All Anthropic API models failed")
}

async function callHackClub(messages, { userId = 'unknown', language = 'English' } = {}) {
    for (const model of HackClubModels) {
        const ctx = newCtx(userId, language);
        try {
            const { message } = await runToolLoop(async (conversation, lastRound) => {
                const res = await fetch('https://ai.hackclub.com/proxy/v1/chat/completions', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${process.env.HACKCLUB_API}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, messages: conversation, ...toolOptions(lastRound) })
                });
                return res.json();
            }, messages, ctx);

            console.log(styleText(['greenBright', 'bold'], `HACKCLUB_API: ${model}`));
            return buildResult(message.content, model, ctx);
        } catch (err) {
            debug_log_err(`HackClub model ${model} failed ${err}`);
        }
    }
    throw new Error(`All HackClub API models failed`)
}

async function callOpenRouter(messages, { userId = 'unknown', language = 'English' } = {}) {
    for (const model of openroute) {
        const ctx = newCtx(userId, language);
        try {
            const { data, message } = await runToolLoop(async (conversation, lastRound) => {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, messages: conversation, ...toolOptions(lastRound) })
                });
                return res.json();
            }, messages, ctx);

            console.log(styleText(['greenBright', 'bold'], `OPENROUTER_API: ${data.model}`));
            return buildResult(message.content, data.model, ctx);
        } catch (err) {
            debug_log_err(`OpenRouter model ${model} failed ${err}`);
        }
    }
    throw new Error(`All OpenRouter models failed`)
}

async function callGroq(messages, { userId = 'unknown', language = 'English' } = {}) {
    for (const model of groqModels) {
        const ctx = newCtx(userId, language);
        try {
            const { message } = await runToolLoop(async (conversation, lastRound) => {
                try {
                    return await groq.chat.completions.create({ model, messages: conversation, ...toolOptions(lastRound) });
                } catch (err) {
                    if (lastRound && String(err.message).includes('tool_use_failed')) {
                        debug_log_warn('Groq ignored tool_choice: none, retrying without tools');
                        return await groq.chat.completions.create({
                            model,
                            messages: [...conversation, { role: 'system', content: 'Respond in plain text only. Do not call any function or tool.' }]
                        });
                    }
                    throw err;
                }
            }, messages, ctx);

            console.log(styleText(['greenBright', 'bold'], `GROQ_API: ${model}`));
            return buildResult(message.content, model, ctx);
        } catch (err) {
            debug_log_err(`Groq model ${model} failed, ${err}`);
        }
    }
    throw new Error(`All Groq Api models failed`)
}

async function callGroqVisionModels(messages) {
    for (const model of visionModel) {
        try {
            const response = await groq.chat.completions.create({ messages, model, reasoning_format: "hidden"});
            console.log(styleText(['greenBright', 'bold'], `GROQ_API_VISIONS_MODEL: ${model}`));
            return { content: response.choices[0].message.content, model: model }
        } catch (err) {
            const logs_vi_groq = `GROQ_API_VISIONS_MODEL ${model} failed, ${err}`;
            debug_log_err(logs_vi_groq)
        }
    }
    throw new Error(`All Groq Api vision models failed`)
}

async function callGemini(messages) {
    const lastMessage = messages[messages.length - 1].content;
    for (const model of geminiModels) {
        try {
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
                method: "POST",
                headers: {
                    'x-goog-api-key': process.env.GEMINI_API,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model, input: lastMessage })
            });
            const data = await response.json();
            const textStep = data.steps.find(step => step.type === 'model_output');
            console.log(styleText(['greenBright', 'bold'], `GEMINI_API: ${model}`));
            return { content: textStep.content[0].text, model: model };
        } catch (err) {
            const logs_gemini = `Gemini model ${model} failed, ${err}`;
            debug_log_err(logs_gemini);
        }
    }
    throw Error(`All Gemini API models failed`)
}  

async function getAiResponse(messages, options = {}) {

    try {
        const ollama_model = await getOllamaModel();
        if (ollama_model) {
            try {
                return await callOllama(messages, ollama_model);
            } catch (err) {
                debug_log_err(`OLLAMA: Failed ${err}`)
                debugging(err)
            }
        } 
    } catch (err) {
        debugging(err)
    }

    try {
        return await callHackClub(messages, options);
    } catch (err) {
        const failed_hc = `HACKCLUB_API: Failed`
        debug_log_err(failed_hc)
    }

    try {
        return await callAnthropic_claude(messages, options);
    } catch (err) {
        const failed_anthropic = `ANTHROPIC_API: Failed`
        debug_log_err(failed_anthropic);
    }

    try {
        return await callGroq(messages, options);
    } catch (err) {
        const failed_q = `GROQ_API: Failed`
        debug_log_err(failed_q)
    }

    try {
        return await callOpenRouter(messages, options);
    } catch (err) {
        const failed_opr = `OPENROUTER_API: Failed`
        debug_log_err(failed_opr)
    }

    try {
        return await callGemini(messages);
    } catch (err) {
        const failed_ge = `GEMINI_API: Failed`
        debug_log_err(failed_ge)
    }

    throw new Error(`All AI providers failed`);
}

async function getVisionAiResponse(messages) {
    try{
        return await callGroqVisionModels(messages);
    } catch (err) {
        const failed_v_g = `GROQ_API_VISION_MODEL: Failed`
        debug_log_err(failed_v_g)
    }
    throw new Error(`All VISION AI providers failed`)
}

export {getAiResponse, getVisionAiResponse, anthropic_image_model };