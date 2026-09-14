import Exa from "exa-js";
import 'dotenv/config'
import { debugging, debug_log_success, debug_log_err } from "../debug/debug.js";

const exa = new Exa(process.env.EXA_API)

async function call_exa (ai_question) {
    let result;
    try {
           result = await exa.search(`${ai_question}`, {
        type: 'auto',
        contents: {
            highlights: true,
        },
    });
    console.log(result)
    debugging(JSON.stringify(result))
} catch (err) {
    const error_exa = `EXA error, ${err}`
    debug_log_err(error_exa)
    debugging(err)
} 
debugging(result)
return result;
}

async function exa_request(ai_question) {
    const exa_final_data = await call_exa(ai_question);
    debugging(JSON.stringify(exa_final_data))
    const exa_success = 'EXA success'
    debug_log_success(exa_success);
    return exa_final_data;
}

const tools = [
    {
        type: 'function',
        function: {
            name: 'search_web',
            description: 'Search the internet for current, up-to-date, or factual information you dont already know.',
            parametrs: {
                type: "object",
                properties: {
                    query: {
                        type: 'string',
                        description: "The search query to look up"
                    }
                },
                required: ["query"]
            }
        }
    }
];

export { call_exa, exa_request, tools }