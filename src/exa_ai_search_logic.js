import Exa from "exa-js";
import 'dotenv/config'
import { debugging, debug_log_success, debug_log_err } from "../debug/debug.js";

let exa = null;
if (!process.env.EXA_API) {
    const no_api_exe = "EXA_API not detected. The bot will not be able to search for information on the internet."
    debugging(no_api_exe)
} else {
    exa = new Exa(process.env.EXA_API)
}

async function call_exa (ai_question) {
    let result;
    try {
           result = await exa.search(`${ai_question}`, {
        type: 'auto',
        contents: {
            highlights: true,
        },
    });
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

const tools = process.env.EXA_API ? [
    {
        type: 'function',
        function: {
            name: 'search_web',
            description: 'ALWAYS use this tool for weather, game information, game character build, current events, sports scores, news, prices, or any question about "today" or real- time information.You do NOT have real- time data access — never guess or make up current facts.',
            parameters: {
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
] : undefined;


export { call_exa, exa_request, tools }