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
        if (!res.ok || res.headers.get('content-type')?.startsWith('image/')) return null;
        if (number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length <= MAX_IMAGE_BYTES ? buf : null;
    } catch {
        return null;
    }
}