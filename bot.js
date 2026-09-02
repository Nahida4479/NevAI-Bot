import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getAiResponse } from './src/models.js';
import { aiCommand } from './src/create_command.js';
import { saveData, loadData } from './src/save_data.js';
import { loadLanguage, languageCommand } from './locales/languages.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

client.once('clientReady', async () => {
    console.log(`Login as ${client.user.tag}`)

    await client.application.commands.set([aiCommand.toJSON(), languageCommand.toJSON()]);
    console.log('Command /ai /language registered');
})

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const data = loadData()
    const langCode = data[message.guildId]?.language || 'EN';
    const lang = loadLanguage(langCode);
    const guildData = data[message.guildId];

    if (!guildData || !guildData.channel) {
        if (message.mentions.has(client.user)) {
            const reply = await message.reply(lang.noChannelSet);
            setTimeout(() => reply.delete(), 4000);
        }
        return
    }

    if (message.channelId !== guildData.channel) return;
    if (!message.mentions.has(client.user)) return;
    console.log('Bot was mentioned on the correct channel');
})


client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ai') {
        const data = loadData()
        const langCode = data[interaction.guildId]?.language || 'EN';
        const lang = loadLanguage(langCode);

        if (!interaction.memberPermissions.has('Administrator')) {
            await interaction.reply({ content: lang.onlyOwner, flags: MessageFlags.Ephemeral });
            return;
        }

        const channel = interaction.options.getChannel('channel');

        if (channel) {
            if (!data[interaction.guildId]) {
                data[interaction.guildId] = {};
            }

            if(data[interaction.guildId].channel === channel.id) {
                delete data[interaction.guildId].channel;
                saveData(data);
                await interaction.reply({ content: `${lang.aiChannelRemoved} ${channel}`, flags: MessageFlags.Ephemeral});
            } else {
                data[interaction.guildId].channel = channel.id;
                saveData(data);
                await interaction.reply({ content: `${lang.aiChannelSet} ${channel}`, flags: MessageFlags.Ephemeral });
            }
        }
    }

if (interaction.commandName === 'language') {
    const lang = interaction.options.getString('lang');
    const data = loadData();

    if (!data[interaction.guildId]) {
        data[interaction.guildId] = {};
    }
    data[interaction.guildId].language = lang;
    saveData(data);
    await interaction.reply({ content: `Language set to ${lang}`, flags: MessageFlags.Ephemeral });
}
});




client.login(process.env.DISCORD_API)