import { createInfographic } from './image.js';
import { reserveImageSlot, releaseImageSlot } from './limits.js';
import { debugging, debug_log_err } from '../../debug/debug.js';

const infographicTool = {
    name: 'create_infographic',
    description: 'Create an infographic image (PNG) about a topic, e.g. a game character build, a tier list or a comparison. Use it ONLY when the user explicitly asks for an infographic, graphic, image or picture. The tool searches the web by itself, so do not call search_web before it.',
    input_schema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Search query with all needed details, e.g. "Nanally Neverness to Everness build"'
            },
            subject: {
                type: 'string',
                description: 'Name of the single character to show as a portrait, e.g. "Nanally". Empty string if the infographic is not about one character.'
            }
        },
        required: ['query']
    }
};

async function runInfographicTool(input, userId, language) {
    const slot = reserveImageSlot(userId);
    if (!slot.ok) {
        return { text: slot.message, png: null };
    }

    try {
        const result = await createInfographic({
            query: input.query,
            subject: input.subject ?? '',
            language
        });
        releaseImageSlot(userId, true);
        debugging(`Infographic OK | user: ${userId} | tokens: ${JSON.stringify(result.usage)} | cost: ~$${result.costUsd.toFixed(4)}`);
        return {
            text: 'The infographic was created and will be attached to your reply automatically. Do not describe it in detail and do not include any links; just add one short sentence.',
            png: result.png
        };
    } catch (err) {
        releaseImageSlot(userId, false);
        debug_log_err(`Infographic failed: ${err}`);
        return {
            text: 'Creating the infographic failed. Briefly tell the user it did not work this time and answer their question in text instead.',
            png: null
        };
    }
}


const infographicToolOpenAI = {
    type: 'function',
    function: {
        name: infographicTool.name,
        description: infographicTool.description,
        parameters: infographicTool.input_schema
    }
};

export { infographicTool, infographicToolOpenAI, runInfographicTool };