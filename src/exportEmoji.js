import { Client } from "discord.js";

export function getEmoji(client, name) {
    const emoji = client.application.emojis.cache.find(e => e.name === name)
    return emoji ? emoji.toString() : '';
}