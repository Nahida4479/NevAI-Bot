import { generateViaGoogleApi } from "./generate_gemini.js";
import { generateViaOpenRouter } from "./generate_openrouter.js";

function detectGenerateImageProvider() {
    const image_provider_api = process.env.GENERATE_IMAGE_API?.trim();
    if (!image_provider_api) return null;

    if (image_provider_api.startsWith('sk-or-')) return 'openrouter';
    if (image_provider_api.startsWith('AIza')) return 'google';
    return null
}



export {detectGenerateImageProvider}