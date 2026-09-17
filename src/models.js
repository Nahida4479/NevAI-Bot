import { userMention } from 'discord.js';
import 'dotenv/config';
import Groq from 'groq-sdk';
import { debugging, debug_log_warn, debug_log_err, debug_log_success } from '../debug/debug.js';
import { styleText } from 'node:util';
import { exa_request, tools, formatSearchResult, search_images } from './exa_ai_search_logic.js';

let groq = null; 
if (process.env.GROQ_API) {
    groq = new Groq({ apiKey: process.env.GROQ_API });
} else {
    const err = `GROQ_API not set - Groq models are not avaliable.`
    debug_log_warn(err)
}


//Free AI Models
const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
const groqModels = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"]
const HackClubModels = ['google/gemini-3-flash-preview']
const visionModel = ["qwen/qwen3.6-27b", "qwen/qwen3.8-27b"]
const openroute = ["openrouter/free"]

async function callOpenRouter(messages) {
    for (const model of openroute) {
        let searchedImageResult;
        let usedInternetSearch = false;
        try {
        let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model, messages, tools }) 
        });
        let data = await response.json();
        let message = data.choices[0].message;

        let tool_rounds = 0;
        while (message.tool_calls && tool_rounds < 1) {
            usedInternetSearch = true;
            const toolCall = message.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            const query = args.query || '';
            if (!query) {
                return { content: "I tried to search but didn't have a clear query.", model: model };
            }
        

        const [searchResult, searchedImageResult] = await Promise.all([
            exa_request(query),
            search_images(query),
        ])
            debugging(searchedImageResult),
            debugging(searchResult)

        const followUpMessage = [
            ...messages,
            message,
            { role: 'tool', tool_call_id: toolCall.id, content: formatSearchResult(searchResult) }
        ]
            
        const isLastRound = tool_rounds === 2
            response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model, messages: followUpMessage, tools, tool_choice: isLastRound ? "none" : "auto" })
            })
        data = await response.json();
        message = data.choices[0].message;
        tool_rounds++;

        }
        console.log(styleText(['greenBright', 'bold'], `OPENROUTER_API: ${data.model}`));
        return { content: data.choices[0].message.content, model: data.model, usedInternetSearch: usedInternetSearch, imageResult: searchedImageResult };
    } catch (err) {
        const logs_err = `OpenRouter model ${model} failed ${err}`
        debug_log_err(logs_err)
    }
}
    throw new Error(`All OpenRouter models failed`)

}

async function callGroq(messages) {
    for (const model of groqModels) {
        let usedInternetSearch = false;
        let searchedImageResult;
        debugging(searchedImageResult);
        try {

            let response = await groq.chat.completions.create({ messages, model, tools });
            let message = response.choices[0].message;
            let tool_rounds = 0

            while (message.tool_calls && tool_rounds < 1) {
                const toolCall = message.tool_calls[0];
                const args = JSON.parse(toolCall.function.arguments);
                const query = args.query || '';
                const query_success = `The model wants to search:, ${query}`;
                debug_log_success(query_success);
                usedInternetSearch = true;
                if (!query) {
                    return { content: "I tried to search but didn't have a clear query.", model: model }; 
                }

                const [searchResult, searchedImageResult] = await Promise.all([
                    exa_request(query),
                    search_images(query),
                ])
                    debugging(searchedImageResult),
                    debugging(searchResult)

                const followUpMessage = [
                    ...messages,
                    message,
                    { role: 'tool', tool_call_id: toolCall.id, content: formatSearchResult(searchResult) }
                ]

                    const isLastRound = tool_rounds === 2
                    try {
                response = await groq.chat.completions.create({ model, messages: followUpMessage, tools, tool_choice: isLastRound ? "none" : "auto" });
                      } catch (toolErr) {
                        if (isLastRound && toolErr.message && toolErr.message.includes('tool_use_failed')) {
                            const warn_err = 'Groq ignored tool_choice: none, retrying without tools'
                            debug_log_warn(warn_err)
                            response = await groq.chat.completions.create({
                                messages: [...followUpMessage, { role: 'system', content: "Respond in plain text only.Do not call any function or tool." }],
                                model
                            });
                        } else {
                            debugging(toolErr)
                            throw toolErr
                        }
                      }  
                    message = response.choices[0].message;
                    tool_rounds++;
            }

            const tool_response = `Tool calls:', ${JSON.stringify(response.choices[0].message.tool_calls, null, 2)}`
            debugging(tool_response)

            const model_groq_api = `GROQ_API: ${model}`
            console.log(styleText(['greenBright', 'bold'], model_groq_api));
            return { content: response.choices[0].message.content, model: model, usedInternetSearch: usedInternetSearch, imageResult: searchedImageResult };
        } catch(err) {
            const logs_groq_message = `Groq model ${model} failed, ${err}`;
            debug_log_err(logs_groq_message)
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

async function callHackClub(messages) {
        for (const model of HackClubModels) {
        let searchedImageResult;
        debugging(searchedImageResult);
        let usedInternetSearch = false;
            try {
        let response = await fetch('https://ai.hackclub.com/proxy/v1/chat/completions', {
            method: "POST",
            headers: {
                'Authorization': `Bearer ${process.env.HACKCLUB_API}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model, messages, tools})
        }); 
        let data = await response.json();
        let message = data.choices[0].message;

        let tool_rounds = 0;
        while (message.tool_calls && tool_rounds < 1) {
            usedInternetSearch = true;
            const toolCall = message.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            const query = args.query || '';
            if (!query) {
                return { content: "I tried to search but didn't have a clear query.", model: model };
            }


            const [searchResult, searchedImageResult] = await Promise.all([
                exa_request(query),
                search_images(query),
            ])
                debugging(searchedImageResult),
                debugging(searchResult)

            const followUpMessage = [
                ...messages,
                message,
                { role: 'tool', tool_call_id: toolCall.id, content: formatSearchResult(searchResult) }
            ]

            const isLastRound = tool_rounds === 2
            response = await fetch('https://ai.hackclub.com/proxy/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.HACKCLUB_API}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model, messages: followUpMessage, tools, tool_choice: isLastRound ? "none" : "auto" })
            })
            data = await response.json();
            message = data.choices[0].message;
            tool_rounds++;
        }
        console.log(styleText(['greenBright', 'bold'], `HACKCLUB_API: ${model}`));
        return { content: data.choices[0].message.content, model: model, usedInternetSearch: usedInternetSearch, imageResult: searchedImageResult};
        } catch (err) {
            const logs_hackclub = `HackClub model ${model} failed ${err}`
            debug_log_err(logs_hackclub)
        }
    }
    throw new Error(`All HackClub API models failed`)
}



async function getAiResponse(messages) {
    try {
        return await callHackClub(messages);
    } catch (err) {
        const failed_hc = `HACKCLUB_API: Failed`
        debug_log_err(failed_hc)
    }

    try {
        return await callGroq(messages);
    } catch (err) {
        const failed_q = `GROQ_API: Failed`
        debug_log_err(failed_q)
    }

    try {
        return await callOpenRouter(messages);
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

export {getAiResponse, getVisionAiResponse};