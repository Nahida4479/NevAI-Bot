import { configDotenv } from "dotenv";
import { debug_log_err, debug_log_success } from "../../debug/debug.js";
import { styleText } from 'node:util';
import { debugging } from "../../debug/debug.js";

let ollamaModel = null;
let lastOllamaCheck = 0;

async function detectOllama() {
    const baseUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    try {
        const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return null;   
        const data = await res.json();
        const names = data.models.map(m => m.name).filter(name => !name.includes('embed'));
        console.log(styleText(['greenBright', 'bold'], 'Ollama models detected:'), styleText(['bgGreen', 'bold'], `${names}`));
        if (names.includes(process.env.OLLAMA_MODEL)) return process.env.OLLAMA_MODEL;
        return names[0] ?? null;
    } catch (err) {
        console.log(styleText(['red', 'bold'], `Ollama error: ${err}`));
        debugging(err)
        return null;
    }
}

async function getOllamaModel() {
    if (Date.now() - lastOllamaCheck > 60_000) {
        ollamaModel = await detectOllama();
        lastOllamaCheck = Date.now();
    }
    return ollamaModel;
}

async function callOllama (messages, model) {
    const baseUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false })
    });

    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);

    const data = await response.json();
    console.log(styleText(['greenBright', 'bold'], `OLLAMA: ${model}`));
    return{
        content: data.choices[0].message.content,
        model,
        usedInternetSearch: false,
        imageResult: null,
        infographicPng: null
    };
}

export { detectOllama, getOllamaModel, callOllama }