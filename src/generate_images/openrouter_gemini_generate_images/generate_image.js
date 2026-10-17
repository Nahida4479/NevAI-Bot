import { MODELS } from "../../../providers_list.js";
import { generateViaGoogleApi } from "./generate_gemini.js";
import { generateViaOpenRouter } from "./generate_openrouter.js";
import { styleText } from 'node:util';

function detectGenerateImageProvider() {
    const image_provider_api = process.env.GENERATE_IMAGE_API?.trim();
    if (!image_provider_api) return null;

    if (image_provider_api.startsWith('sk-or-')) return 'openrouter';
    if (image_provider_api.startsWith('AIza')) return 'google';
    return null


}

function isImageGenerationAvailable() {
    const provider = detectGenerateImageProvider();
    return !!provider && !!MODELS.image?.[provider]
}

async function GenerateImage(prompt, images = []) {
    const provider = detectGenerateImageProvider();
    const model = MODELS.image?.[provider]
    if (!provider || !model) throw new Error('Image generation is not configured');

    if (provider === 'openrouter') return generateViaOpenRouter(prompt, images, model)
    if (provider === 'google') return generateViaGoogleApi(prompt, images, model);
    throw new Error(`Unsupported image provider: ${provider}`)
}


const imageToolOpenAI = {
    type: 'function',
    function: {
        name: 'generate_image',
        description: 'Generate an image from a text description. Use ONLY when the user explicitly asks to create, draw or generate a picture.',
        parameters: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Detailed description of the image, in English.' }
            },
            required: ['prompt']
        }
    }
};

const imageToolClaude = {
    name: imageToolOpenAI.function.name,
    description: imageToolOpenAI.function.description,
    input_schema: imageToolOpenAI.function.parameters
};

export {detectGenerateImageProvider, isImageGenerationAvailable, GenerateImage, imageToolClaude, imageToolOpenAI }