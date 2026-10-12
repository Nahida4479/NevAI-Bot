import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import Exa from 'exa-js';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { debugging } from '../../debug/debug.js';

const MODEL = 'claude-haiku-5-5';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const norm = (s) => s.toLowerCase().replace(/[\s\-_]/g, '');

async function fetchImageBuffer(url) {
    if (!url.startsWith('https://')) return null;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return null;
        if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length <= MAX_IMAGE_BYTES ? buf : null;
    } catch (err) {
        debugging(`fetchImageBuffer failed: ${url}, err: ${err}`);
        return null;
    }
}

async function pickPortrait(client, urls, subject, addUsage) {
    const thumbs = await Promise.all(urls.map(async (url) => {
        const buf = await fetchImageBuffer(url);
        if (!buf) return null;
        try {
            const small = await sharp(buf)
                .resize({ width: 320, height: 320, fit: 'inside' })
                .jpeg({ quality: 70 })
                .toBuffer();
            return { url, buf, data: small.toString('base64') };
        } catch (err) {
            debugging(`Sharp error ${err}`);
            return null;
        }
    }));

    const valid = thumbs.filter(Boolean);
    if (!valid.length) return null;

    const block = valid.flatMap((t, i) => [
        { type: 'text', text: `Image ${i} (file: ${t.url.split('/').pop().split('?')[0]}):` },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: t.data } }
    ]);
    block.push({
        type: 'text',
        text: `Which image is official character art or a portrait of "${subject}" (the character itself; NOT an item, module, icon, logo, map or UI)? Reply with ONLY the image number, or -1 if none fits.`
    });

    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        messages: [{ role: 'user', content: block }]
    });
    addUsage(response.usage);

    const answer = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    const n = parseInt(answer.match(/-?\d+/)?.[0] ?? '-1', 10);
    debugging(`Portrait pick: ${n} of ${valid.length}`);
    return valid[n]?.buf ?? null;
}

async function createInfographic({ query, subject = '', instructions = '', language = 'English' }) {
    if (!process.env.EXA_API) throw new Error('EXA_API is not set');
    if (!process.env.ANTHROPIC_API) throw new Error('ANTHROPIC_API is not set');
    if (!query) throw new Error('Missing query');

    const usage = { input: 0, output: 0 };
    const addUsage = (u) => {
        usage.input += u.input_tokens;
        usage.output += u.output_tokens;
    };
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API, timeout: 120_000, maxRetries: 1 });

    const exa = new Exa(process.env.EXA_API);
        const exaRes = await exa.search(query, {
        type: 'auto',
        numResults: 6,
        contents: {
            text: { maxCharacters: 3000 },
            highlights: { query, maxCharacters: 2000 },
            extras: { imageLinks: 10 }
        }
    });
    const results = exaRes.results ?? [];
    if (!results.length) throw new Error('No search results');

    const searchText = results
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\nKey passages:\n${(r.highlights ?? []).join('\n')}\nPage text:\n${r.text ?? ''}`)
        .join('\n\n');

    let dataUri = null;
    if (subject) {
        const key = norm(subject);
        const candidates = results
            .filter(r => norm(`${r.title} ${r.url}`).includes(key))
            .flatMap(r => r.extras?.imageLinks ?? [])
            .filter(u => /\.(png|jpe?g|webp)(\?|$)/i.test(u));
        const preferred = candidates.filter(u => norm(u).includes(key));
        const pool = [...new Set([...preferred, ...candidates])].slice(0, 10);

        if (pool.length) {
            const buf = await pickPortrait(client, pool, subject, addUsage);
            if (buf) {
                const jpg = await sharp(buf)
                    .resize({ width: 600, height: 920, fit: 'cover', position: 'top' })
                    .jpeg({ quality: 85 })
                    .toBuffer();
                dataUri = `data:image/jpeg;base64,${jpg.toString('base64')}`;
            }
        }
    }

     const portraitRule = dataUri
        ? `Include a portrait: <image xlink:href="PORTRAIT_PLACEHOLDER" x="60" y="140" width="300" height="460" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitClip)"/> with a rounded-rect clipPath id="portraitClip" of the same size. Use exactly the text PORTRAIT_PLACEHOLDER as href. Lay out the rest of the content to the right of it.`
        : 'Do not draw a portrait.';

    const system = `You generate SVG infographics. Reply with ONLY one complete <svg> element, no markdown, no explanation.
Rules: width="1024" height="768" with a matching viewBox, and xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink".
Use only basic shapes, paths, gradients and <text> with font-family="sans-serif". No emoji, no scripts, no external resources.
${portraitRule}
Use ONLY facts found in the SEARCH RESULTS. If something is not in them, do not invent it; say that no data was found instead.
Write all text in ${language}. Keep every text inside the canvas with margins and no overlaps. Dark theme, purple accents unless the user's wishes say otherwise.
Do not put source numbers like [1] or [2] anywhere in the text. Add a small footer listing only the source site names, separated by commas (e.g. "Sources: Game8").
Keep the SVG compact: no more than about 120 elements, reuse gradients, no decorative filler. Each line of text must fit inside its box: keep lines under about 55 characters at font-size 14, and split longer facts into several <text> lines instead of one long line.`;

        const userContent = `Task: infographic about: ${query}` + (instructions ? `\nUser's wishes (follow them, but still use only facts from the search results): ${instructions}` : '') + `\n\nSEARCH RESULTS:\n${searchText}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: 16000,
            system,
            messages: [{ role: 'user', content: userContent }]
        });
        addUsage(response.usage);

        const text = response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');
        let svg = text.match(/<svg[\s\S]*<\/svg>/)?.[0];

        if (!svg || /<script|<foreignObject|href\s*=\s*["']https?:/i.test(svg)) {
            debugging(`SVG attempt ${attempt} invalid (stop_reason: ${response.stop_reason})`);
            continue;
        }
        svg = svg.replace(/\s*\[\d+\]/g, '');
        if (dataUri) svg = svg.replaceAll('PORTRAIT_PLACEHOLDER', dataUri);

        try {
            const png = new Resvg(svg, {
            font: {
                loadSystemFonts: true,
                defaultFontFamily: 'Noto Sans',
                sansSerifFamily: 'Noto Sans'
            }
        }).render().asPng();
            const costUsd = (usage.input * 0.10 + usage.output * 0.50) / 1_000_000;
            return { png, portrait: Boolean(dataUri), usage, costUsd };
        } catch (err) {
            debugging(`SVG render attempt ${attempt} failed: ${err}`);
        }
    }
    throw new Error('Could not generate a valid infographic');
}

export { fetchImageBuffer, pickPortrait, createInfographic };