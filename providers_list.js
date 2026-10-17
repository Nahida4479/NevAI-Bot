// Order in which AI providers are tried. The first available one answers.
export const DEFAULT_ORDER = ['ollama', 'hackclub', 'anthropic', 'groq', 'openrouter', 'gemini'];

// Vision AI Providers
export const VISION_ORDER = ['groq', 'hackclub', 'gemini', 'openrouter', 'anthropic'];

// Models used by each provider (tried from first to last).
export const MODELS = {
    hackclub:   ['openai/gpt-6-luna'],
    groq:       ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'],
    openrouter: ['openrouter/free'],
    gemini:     ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    anthropic:  ['claude-haiku-5-5'],

    // Groq models that can read images (used when users send pictures).
    groqVision: ['qwen/qwen3.6-27b', 'qwen/qwen3.8-27b'],

    // Anthropic model used to generate infographics (paid). Single model.
    infographic: 'claude-haiku-5-5', 

    // Generate images (paid api)
     image: {
        openrouter: 'google/gemini-3.1-flash-lite-image',
        google: 'google/gemini-3.1-flash-lite-image',
    },

    vision: {
        groq:       ['qwen/qwen3.6-27b', 'qwen/qwen3.8-27b'],
        gemini:     [''],
        hackclub:   [''], 
        openrouter: [''], 
        anthropic:  ['claude-haiku-5-5'], // Paid
    },
};