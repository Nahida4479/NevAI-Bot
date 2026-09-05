import { userMention } from 'discord.js';
import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API});

const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
const groqModels = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"]
const HackClubModels = ['meta-llama/llama-3.3-70b-instruct']
const visionModel = ["qwen/qwen3.6-27b", "qwen/qwen3.8-27b"]

async function callGroq(messages) {
    for (const model of groqModels) {
        try {
            const response = await groq.chat.completions.create({ messages, model });
            console.log(`GROQ_API: ${model}`)
            return response.choices[0].message.content;
        } catch(err) {
            console.log(`Groq model ${model} failed, ${err}`);
        }
    }
    throw new Error(`All Groq Api models failed`)
}

async function callGroqVisionModels(message) {
    for (const model of groqModels) {
        try {
            const response = await groq.chat.completions.create({ messages, model});
            console.log(`GROQ_API_VISIONS_MODEL: ${model}`)
            return response.choices[0].message.content;
        } catch (err) {
            console.log(`GROQ_API_VISIONS_MODEL ${model} failed, ${err}`)
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
            return textStep.content[0].text;
        } catch (err) {
            console.log(`Gemini model ${model} failed, ${err}`);
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
        return data.choices[0].message.content;
        } catch (err) {
            console.log(`HackClub model ${model} failed ${err}`)
        }
    }
    throw new Error(`All HackClub API models failed`)
}



async function getAiResponse(messages) {
    try {
        return await callGroq(messages);
    } catch (err) {
        console.log(`GROQ_API: Failed`)
    }

    try {
        return await callHackClub(messages);
    } catch (err) {
        console.log(`HACKCLUB_API: Failed`)
    }

    try {
        return await callGemini(messages);
    } catch (err) {
        console.log(`GEMINI_API: Failed`)
    }

    throw new Error(`All AI providers failed`);
}


export {getAiResponse};