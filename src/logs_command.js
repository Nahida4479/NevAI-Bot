import { EmbedBuilder } from "discord.js";

async function sendLogEmbed(client, guildData, title, color, fields) {
    if (!guildData.logschannel) return;
    const logChannel = client.channels.cache.get(guildData.logschannel);
    if (!logChannel) return;

    const logEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .addFields(fields)
        .setTimestamp();
        
    await logChannel.send({ embeds: [logEmbed] });
}

export { sendLogEmbed }