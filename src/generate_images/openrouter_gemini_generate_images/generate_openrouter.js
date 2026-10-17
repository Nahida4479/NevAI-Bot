import { styleText } from 'node:util';

async function generateViaOpenRouter(prompt, images, model) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.GENERATE_IMAGE_API}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            modalities: ['image', 'text'],
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    ...images.map(img => ({
                        type: 'image_url',
                        image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
                    }))
                ]
            }]
        })
    });
    if (!res.ok) throw new Error(`OpenRouter image HTTP ${res.status}`);

    const data = await res.json();
    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error('No image returned');
    console.log(styleText(['greenBright', 'bold'], `OPENROUTER_IMAGE_API: ${model}`));
    return Buffer.from(url.split(',')[1], 'base64');
}

export { generateViaOpenRouter }