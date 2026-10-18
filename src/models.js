import { userMention } from 'discord.js';
import 'dotenv/config';
import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { debugging, debug_log_warn, debug_log_err, debug_log_success } from '../debug/debug.js';
import { styleText } from 'node:util';
import { exa_request, tools, formatSearchResult, search_images } from './exa_ai_search_logic.js';
import { infographicTool, infographicToolOpenAI, runInfographicTool } from './generate_images/tool.js';
import { callOllama, getOllamaModel } from './ollama/detect_ollama.js';
import { DEFAULT_ORDER, MODELS } from '../providers_list.js';
import { GenerateImage, isImageGenerationAvailable,imageToolClaude, imageToolOpenAI } from './generate_images/openrouter_gemini_generate_images/generate_image.js';
import { reserveImageSlot, releaseImageSlot } from './generate_images/openrouter_gemini_generate_images/generate_image_limits.js';

let groq = null; 
if (process.env.GROQ_API) {
    groq = new Groq({ apiKey: process.env.GROQ_API });
} else {
    const err = `GROQ_API not set - Groq models are not avaliable.`
    debugging(err)
}


//Free AI Models
const geminiModels = MODELS.gemini;
const groqModels = MODELS.groq;
const HackClubModels = MODELS.hackclub;
const openroute = MODELS.openrouter;

// Paid AI models
const anthropic_claude = MODELS.anthropic;
const anthropic_image_model = MODELS.infographic;


const claudeTools = tools?.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters
}))

function getOpenAITools(disabledTools = []) {
    const list = [...(tools ?? [])];
    if (process.env.EXA_API && process.env.ANTHROPIC_API) list.push(infographicToolOpenAI);
    if (isImageGenerationAvailable()) list.push(imageToolOpenAI);
    return list.filter(t => !disabledTools.includes(t.function.name));
}

async function executeTool(name, input, ctx) {
    if (ctx.disabledTools.includes(name)) return 'This tool is disabled on this server.';
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

    if (name === 'generate_image') {
    try {
        ctx.generatedImage = await generateImageLimited(input.prompt || '', ctx.images, ctx.userId);
        return 'Image generated successfully and attached to the reply. Briefly describe it to the user.';
    } catch (err) {
        if (IMAGE_LIMIT_MESSAGES[err.message]) return IMAGE_LIMIT_MESSAGES[err.message];
        debug_log_err(`Image generation failed: ${err}`);
        return 'Image generation failed. Tell the user to try again later.';
    }
}

    if (name === 'create_infographic') {
        const result = await runInfographicTool(input, ctx.userId, ctx.language);
        if (result.png) ctx.infographicPng = result.png;
        return result.text;
    }
    return 'Unknown tool';
}


function newCtx(userId, language, disabledTools = [], images = []) {
    return { userId, language, disabledTools, images, usedInternetSearch: false, imageResult: undefined, infographicPng: null, generatedImage: null };
}

function toolOptions(lastRound, ctx) {
    const list = getOpenAITools(ctx.disabledTools)
    if (!list.length) return {};
    return { tools: list, tool_choice: lastRound ? 'none' : 'auto' };
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
        infographicPng: ctx.infographicPng,
        generatedImage: ctx.generatedImage
    };
}

function toAnthropicContent(content) {
    if (!Array.isArray(content)) return content;
    return content.map(part => {
        if (part.type !== 'image_url') return part;
        const match = part.image_url.url.match(/^data:(.+?);base64,(.+)$/);
        if (!match) return part;
        return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
    });
}

async function callAnthropic_claude(messages, { userId = 'unknown', language = 'English', disabledTools = [], images = [] } = {}) {
    for (const model of anthropic_claude) {
        let inputTokens = 0;
        let outputTokens = 0;
        const system = messages[0].content;
        const chat = messages.slice(1).map(m => ({ ...m, content: toAnthropicContent(m.content) }));
        while (chat.length && chat[0].role == "assistant") chat.shift();
        let searchedImageResult;
        let usedInternetSearch = false;
        let infographicPng = null;
        let generatedImage = null;

        try {
            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API });
            const allTools = [...(claudeTools ?? [])];
            if (process.env.EXA_API) allTools.push(infographicTool);
            if (isImageGenerationAvailable()) allTools.push(imageToolClaude);
            const enabledTools = allTools.filter(t => !disabledTools.includes(t.name));

            const conversation = [...chat];
            let response;

            for (let round = 0; round < 3; round++) {
                const lastRound = round === 2;
                debugging(`Anthropic tools: ${enabledTools.map(t => t.name).join(', ')}`);
                response = await client.messages.create({
                    max_tokens: 2500,
                    system,
                    model,
                    tools: enabledTools,
                    tool_choice: lastRound ? { type: 'none' } : { type: 'auto' },
                    messages: conversation
                });
                inputTokens += response.usage.input_tokens;
                outputTokens += response.usage.output_tokens;

                if (response.stop_reason !== 'tool_use') break;

                const toolUses = response.content.filter(b => b.type === 'tool_use');
                const toolResults = [];

                for (const toolUse of toolUses) {
                    if (disabledTools.includes(toolUse.name)) {
                        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'This tool is disabled on this server.' });
                        continue;
                    }
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

                    } else if (toolUse.name === 'generate_image') {
                        try {
                            generatedImage = await generateImageLimited(toolUse.input.prompt || '', images, userId);
                            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Image generated successfully and attached to the reply.' });
                        } catch (err) {
                            const reason = IMAGE_LIMIT_MESSAGES[err.message];
                            if (!reason) debug_log_err(`Image generation failed: ${err}`);
                            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: reason ?? 'Image generation failed.', is_error: !reason });
                        } 
                    } else {
                        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Unknown tool', is_error: true });
                    }
                }

                conversation.push({ role: 'assistant', content: response.content });
                conversation.push({ role: 'user', content: toolResults });
            }

            const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
            console.log(styleText(['greenBright', 'bold'], `ANTHROPIC_API: ${model}`), styleText(['bgYellow', 'bold'], `Input Tokens: ${inputTokens} | Output Tokens: ${outputTokens}`));
            return { content: text, model, usedInternetSearch, imageResult: searchedImageResult, infographicPng, generatedImage };
        } catch (err) {
            debug_log_err(`Anthropic model ${model} failed, ${err}`);
        }
    }
    throw new Error("All Anthropic API models failed")
}

async function callHackClub(messages, { userId = 'unknown', language = 'English', disabledTools = [], images = [] } = {}) {
    for (const model of HackClubModels) {
        const ctx = newCtx(userId, language, disabledTools, images);
        try {
            const { message } = await runToolLoop(async (conversation, lastRound) => {
                const res = await fetch('https://ai.hackclub.com/proxy/v1/chat/completions', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${process.env.HACKCLUB_API}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, messages: conversation, ...toolOptions(lastRound, ctx) })
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

async function callOpenRouter(messages, { userId = 'unknown', language = 'English', disabledTools = [], images = [] } = {}) {
    for (const model of openroute) {
        const ctx = newCtx(userId, language, disabledTools, images);
        try {
            const { data, message } = await runToolLoop(async (conversation, lastRound) => {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, messages: conversation, ...toolOptions(lastRound, ctx) })
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

async function callGroq(messages, { userId = 'unknown', language = 'English', disabledTools = [], images = [] } = {}) {
    for (const model of groqModels) {
        const ctx = newCtx(userId, language, disabledTools, images);
        try {
            const { message } = await runToolLoop(async (conversation, lastRound) => {
                try {
                    return await groq.chat.completions.create({ model, messages: conversation, ...toolOptions(lastRound, ctx) });
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
    const order = resolveOrder(options.providerSettings);
    if (order.length === 0) throw new Error('NO_PROVIDERS_ENABLED')
    for (const id of order) {
        const provider = PROVIDERS[id];
        if (!(await provider.isAvailable())) continue;
        try {
            return await provider.call(messages, options);
        } catch (err) {
            debug_log_err(`${provider.label}: Failed ${err}`)
        }
    }

    throw new Error(`All AI providers failed`);
}

function resolveOrder(settings) {
    const saved = (settings?.order ?? []).filter(id => PROVIDERS[id]);
    const disabled = new Set(settings?.disabled ?? []);
    const order = [...saved, ...DEFAULT_ORDER.filter(id => !saved.includes(id))];
    return order.filter(id => !disabled.has(id));
}

async function getProviderStatus(settings) {
    const saved = (settings?.order ?? []).filter(id => PROVIDERS[id]);
    const order = [...saved, ...DEFAULT_ORDER.filter(id => !saved.includes(id))];
    const disabled = new Set(settings?.disabled ?? []);

    return Promise.all(order.map(async id => ({
        id,
        label: PROVIDERS[id].label,
        enabled: !disabled.has(id),
        available: await PROVIDERS[id].isAvailable()
    })));
}

const PROVIDERS = {
    ollama: {
        label: 'Ollama',
        paid: false,
        isAvailable: async () => !!(await getOllamaModel()),
        call: async (messages) => callOllama(messages, await getOllamaModel())
    },
    hackclub: {
        label: 'Hack Club',
        paid: false,
        isAvailable: async () => !!process.env.HACKCLUB_API?.trim(),
        call: callHackClub
    },
    anthropic: {
        label: 'Anthropic',
        paid: true,
        isAvailable: async () => !!process.env.ANTHROPIC_API?.trim(),
        call: callAnthropic_claude
    },
    groq: {
        label: 'Groq',
        paid: false,
        isAvailable: async () => !!process.env.GROQ_API?.trim(),
        call: callGroq
    },
    openrouter: {
        label: 'OpenRouter',
        paid: false,
        isAvailable: async () => !!process.env.OPENROUTER_API?.trim(),
        call: callOpenRouter
    },
    gemini: {
        label: 'Gemini',
        paid: false,
        isAvailable: async () => !!process.env.GEMINI_API?.trim(),
        call: callGemini
    }
};


async function generateImageLimited(prompt, images, userId) {
    const denied = reserveImageSlot(userId);
    if (denied) throw new Error(denied);

    let ok = false;
    try {
        const png = await GenerateImage(prompt, images);
        ok = true;
        return png;
    } finally {
        releaseImageSlot(userId, ok);
    }
}

const IMAGE_LIMIT_MESSAGES = {
    IMAGE_LIMIT_PARALLEL: 'Too many images are being generated right now. Tell the user to try again in a moment.',
    IMAGE_LIMIT_GLOBAL: 'The daily image generation limit of this bot has been reached. Tell the user to try again tomorrow.',
    IMAGE_LIMIT_USER: 'This user has reached the daily image generation limit. Tell them to try again tomorrow.'
};

export { getAiResponse, anthropic_image_model, getProviderStatus };