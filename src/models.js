import { userMention } from 'discord.js';
import 'dotenv/config';
import Groq from 'groq-sdk';
import { debugging } from '../debug/debug.js';

let groq = null; 
if (process.env.GROQ_API) {
    new Groq({ apiKey: process.env.GROQ_API });
} else {
    const err = console.warn(`GROQ_API not set - Groq models are not avaliable.`)
}


//Free AI Models
const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
const groqModels = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"]
const HackClubModels = ['meta-llama/llama-3.3-70b-instruct']
const visionModel = ["qwen/qwen3.6-27b", "qwen/qwen3.8-27b"]
const openroute = ["openrouter/free"]

async function callOpenRouter(messages) {
    for (const model of openroute) {
        try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model, messages}) 
        });
        const data = await response.json();
        console.log(`OPENROUTER_API: ${data.model}`);
        return { content: data.choices[0].message.content, model: data.model };
    } catch (err) {
        const logs = console.log(`OpenRouter model ${data.model} failed , ${err}`)
        debugging(JSON.stringify(logs))
    }
}
    throw new Error(`All OpenRouter models failed`)

}

async function callGroq(messages) {
    for (const model of groqModels) {
        try {
            const response = await groq.chat.completions.create({ messages, model, reasoning_format: "hidden" });
            console.log(`GROQ_API: ${model}`)
            return { content: response.choices[0].message.content, model: model };
        } catch(err) {
            const logs = console.log(`Groq model ${model} failed, ${err}`);
            debugging(JSON.stringify(logs))
        }
    }
    throw new Error(`All Groq Api models failed`)
}

async function callGroqVisionModels(messages) {
    for (const model of visionModel) {
        try {
            const response = await groq.chat.completions.create({ messages, model, reasoning_format: "hidden"});
            console.log(`GROQ_API_VISIONS_MODEL: ${model}`)
            return { content: response.choices[0].message.content, model: model }
        } catch (err) {
            const logs = console.log(`GROQ_API_VISIONS_MODEL ${model} failed, ${err}`)
            debugging(JSON.stringify(logs))
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
            console.log(`GEMINI_API: ${model}`);
            return { content: textStep.content[0].text, model: model };
        } catch (err) {
            const logs = console.log(`Gemini model ${model} failed, ${err}`);
            debugging(JSON.stringify(logs))
        }
    }
    throw Error(`All Gemini API models failed`)
}  

async function callHackClub(messages) {
        for (const model of HackClubModels) {

            try {
        const respond = await fetch('https://ai.hackclub.com/proxy/v1/chat/completions', {
            method: "POST",
            headers: {
                'Authorization': `Bearer ${process.env.HACKCLUB_API}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model, messages })
        });
        const data = await respond.json();
        console.log(`HACKCLUB_API: ${model}`);
        return { content: data.choices[0].message.content, model: model};
        } catch (err) {
            const logs = console.log(`HackClub model ${model} failed ${err}`)
            debugging(JSON.stringify(logs))
        }
    }
    throw new Error(`All HackClub API models failed`)
}



async function getAiResponse(messages) {
    try {
        return await callGroq(messages);
    } catch (err) {
        console.log(`GROQ_API: Failed ,`)
        debugging(JSON.stringify(err))
    }

    try {
        return await callHackClub(messages);
    } catch (err) {
        console.log(`HACKCLUB_API: Failed,`)
        debugging(JSON.stringify(err))
    }

    try {
        return await callGemini(messages);
    } catch (err) {
        console.log(`GEMINI_API: Failed`)
        debugging(JSON.stringify(err))
    }

    try {
        return await callOpenRouter(messages);
    } catch (err) {
        console.log(`OPENROUTER_API: Failed`)
        debugging(JSON.stringify(err))
    }

    throw new Error(`All AI providers failed`);
}

async function getVisionAiResponse(messages) {
    try{
        return await callGroqVisionModels(messages);
    } catch (err) {
        console.log(`GROQ_API_VISION_MODEL: Failed`)
        debugging(JSON.stringify(err))
    }
    throw new Error(`All VISION AI providers failed`)
}

export {getAiResponse, getVisionAiResponse};