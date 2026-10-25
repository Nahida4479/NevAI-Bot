// Order in which AI providers are tried. The first available one answers.
export const DEFAULT_ORDER = ['ollama', 'hackclub', 'anthropic', 'groq', 'openrouter', 'gemini'];


// Models used by each provider (tried from first to last).
export const MODELS = {
    hackclub:   ['openai/gpt-6-luna'],
    groq:       ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'],
    openrouter: ['openrouter/free'],
    gemini:     ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    anthropic:  ['claude-haiku-5-5'],

    // Anthropic model used to generate infographics (paid). Single model.
    infographic: 'claude-haiku-5-5', 

    // Generate images (paid api)
     image: {
        openrouter: 'google/gemini-nano-banana-2.1', // Paid gemini-3.1-flash-lite-image
        google: 'gemini-3.1-flash-lite-image', // gemini-3.1-flash-lite-image
    },
};