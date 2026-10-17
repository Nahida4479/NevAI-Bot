async function generateViaGoogleApi(prompt, images, model) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
            'x-goog-api-key': process.env.GENERATE_IMAGE_API,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    ...images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } }))
                ]
            }]
        })
    });
    if (!res.ok) throw new Error(`Google image HTTP ${res.status}`);

    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) throw new Error('No image returned');
    console.log(styleText(['greenBright', 'bold'], `GOOGLE_IMAGE_API: ${model}`));
    return Buffer.from(part.inlineData.data, 'base64');
}

export { generateViaGoogleApi }