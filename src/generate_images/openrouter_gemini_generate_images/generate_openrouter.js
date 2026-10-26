import { styleText } from 'node:util';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_IMAGES_URL = 'https://openrouter.ai/api/v1/images';

function buildContent(prompt, images, allowPlainText) {
    if (allowPlainText && !images.length) return prompt;
    return [
        { type: 'text', text: prompt },
        ...images.map(img => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
        }))
    ];
}

const REQUEST_VARIANTS = [
    {
        name: 'gemini',
        url: OPENROUTER_CHAT_URL,
        body: (prompt, images, model) => ({
            model,
            modalities: ['image', 'text'],
            messages: [{ role: 'user', content: buildContent(prompt, images, false) }]
        })
    },
    {
        name: 'openai',
        url: OPENROUTER_IMAGES_URL,
        body: (prompt, images, model) => ({
            model,
            prompt,
            ...(images.length && {
                input_references: images.map(img => ({
                    type: 'image_url',
                    image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
                }))
            })
        })
    }
];

function findImageUrl(message) {
    if (!message) return null;

    const fromImages = message.images?.find(img => img?.image_url?.url)?.image_url?.url;
    if (fromImages) return fromImages;

    if (Array.isArray(message.content)) {
        for (const part of message.content) {
            const url = part?.image_url?.url ?? part?.image_url ?? part?.url;
            if (typeof url === 'string') return url;
            if (part?.b64_json) return `data:image/png;base64,${part.b64_json}`;
        }
    }

    if (typeof message.content === 'string') {
        const match = message.content.match(/data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)"'\]]+/);
        if (match) return match[0];
    }

    return null;
}

async function urlToBuffer(url) {
    if (url.startsWith('data:')) return Buffer.from(url.split(',')[1], 'base64');

    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenRouter image download HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

async function requestImage(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.GENERATE_IMAGE_API}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const details = (await res.text().catch(() => '')).slice(0, 300);
        throw new Error(`OpenRouter image HTTP ${res.status}${details ? `: ${details}` : ''}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(`OpenRouter image error: ${data.error.message ?? JSON.stringify(data.error)}`);

    const b64 = data.data?.[0]?.b64_json;
    if (b64) return Buffer.from(b64, 'base64');

    const imageUrl = data.data?.[0]?.url ?? findImageUrl(data.choices?.[0]?.message);
    if (!imageUrl) throw new Error('No image returned');
    return urlToBuffer(imageUrl);
}

async function generateViaOpenRouter(prompt, images, model) {
    const errors = [];

    for (const variant of REQUEST_VARIANTS) {
        try {
            const buffer = await requestImage(variant.url, variant.body(prompt, images, model));
            console.log(styleText(['greenBright', 'bold'], `OPENROUTER_IMAGE_API (${variant.name}): ${model}`));
            return buffer;
        } catch (err) {
            errors.push(`${variant.name}: ${err.message}`);
            console.log(styleText(['yellow'], `OPENROUTER_IMAGE_API (${variant.name}) failed: ${err.message}`));
        }
    }

    throw new Error(`OpenRouter image generation failed (${errors.join(' | ')})`);
}

export { generateViaOpenRouter }
