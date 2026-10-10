import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import Exa from 'exa-js';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { debugging } from '../../debug/debug.js';
import { anthropic_image_model } from '../models.js';

const MODEL = anthropic_image_model;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
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
        debugging(` fetchImageBuffer failed: ${url}, err: ${err}`);
        return null;
    }
}


async function pickPortrait(client, urls, subject, addUsage) {
    const thumbs = await Promise.all(urls.map(async (url) => {
        const buf = await fetchImageBuffer(url);
        if (!buf) return null;
        
        try {
            const small = await sharp(buf)
                .resize({ width: 320, height: 320, fit: "inside"})
                .jped({ quality: 70 })
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
        text: 'Which image is official character art or a portrait of "${subject}'
    })
}