import { Client } from "discord.js";

export async function ensureEmojis(client) {
    await client.application.emojis.fetch();
    const existing = client.application.emojis.cache.map(e => e.name);

    if (!existing.includes('success')) {
        await client.application.emojis.create({
            attachment: './src/discord_emoji/nevai-emoji-success.png',
            name: 'success'
        });
        console.log('Emoji success loaded');
    }

    if (!existing.includes('error')) {
        await client.application.emojis.create({
            attachment: './src/discord_emoji/nevai-emoji-error.png',
            name: 'error'
        });
        console.log('Emoji error loaded');
    }
}

export function getEmoji(client, name) {
    const emoji = client.application.emojis.cache.find(e => e.name === name);
    return emoji ? emoji.toString() : '';
}