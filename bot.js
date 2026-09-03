import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, MessageFlags, ButtonStyle, ButtonBuilder, ActionRowBuilder, Message, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getAiResponse } from './src/models.js';
import { aiCommand, aiSettingsCommand } from './src/create_command.js';
import { saveData, loadData } from './src/save_data.js';
import { loadLanguage, languageCommand } from './locales/languages.js';
import { Models } from 'groq-sdk/resources';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

client.once('clientReady', async () => {
    console.log(`Login as ${client.user.tag}`)

    await client.application.commands.set([aiCommand.toJSON(), languageCommand.toJSON(), aiSettingsCommand.toJSON()]);
    console.log('Command /ai /language /ai_settings registered');
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

    if (!guildData.history) {
        guildData.history = [];
    }

    guildData.history.push({ role: 'user', content: message.content });

    const systemPrompt = guildData.prompt || 'You are a helpful assistant named NevAI';
    const messageToSend = [
        { role: 'system', content: systemPrompt },
        ...guildData.history
    ]

    await message.react(guildData.emoji || '🤔')
    const response = await getAiResponse(messageToSend)

    guildData.history.push({ role: 'assistant', content: response });

    if (guildData.history.length > 15) {
        guildData.history = guildData.history.slice(-15);
    }

    data[message.guildId] = guildData;
    saveData(data);

    await message.reply(response)
    await message.reactions.removeAll();

})


client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {

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



if (interaction.commandName === 'ai_settings') {
    if (!interaction.memberPermissions.has('Administrator')) {
        await interaction.reply({ content: lang.onlyOwner, flags: MessageFlags.Ephemeral});
        return;
    }
    const data = loadData()
    const langCode = data[interaction.guildId]?.language || 'EN';
    const lang = loadLanguage(langCode);

    const embed = new EmbedBuilder()
        .setTitle(lang.SettingsTitle)
        .setDescription(lang.setPromptButton)  
        .setColor(0x5865F2);
    
    const button = new ButtonBuilder()
        .setCustomId('open_prompt')
        .setLabel(lang.setPrompt)
        .setStyle(ButtonStyle.Primary);

    const emoji_button = new ButtonBuilder()
        .setCustomId('emoji_button')
        .setLabel(lang.AddEmoji)
        .setStyle(ButtonStyle.Primary)

    const row = new ActionRowBuilder().addComponents(button);
    const row_emoji = new ActionRowBuilder().addComponents(emoji_button);
    
    await interaction.reply({ embeds: [embed], components: [row, row_emoji], flags: MessageFlags.Ephemeral})
    }
}

if (interaction.isButton() && interaction.customId === 'open_prompt') {
    const data = loadData();
    const langCode = data[interaction.guildId]?.language || 'EN';
    const lang = loadLanguage(langCode);


    const modal = new ModalBuilder()
        .setCustomId('prompt_modal')
        .setTitle(lang.setCustomAiPrompt);

    const promptInput = new TextInputBuilder()
        .setCustomId('prompt_input')
        .setLabel(lang.EnterAiPrompt)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)

    const modalRow = new ActionRowBuilder().addComponents(promptInput);
    modal.addComponents(modalRow)

    await interaction.showModal(modal);
}


if (interaction.isButton() && interaction.customId === 'emoji_button') {
    const data = loadData();
    const langCode = data[interaction.guildId]?.language || 'EN';
    const lang = loadLanguage(langCode);

    const modal = new ModalBuilder()
        .setCustomId('emoji_modal')
        .setTitle(lang.setThinkingEmoji);

    const emojiInput = new TextInputBuilder()
        .setCustomId('emoji_input')
        .setLabel(lang.EnterEmoji)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const modalRow = new ActionRowBuilder().addComponents(emojiInput);
    modal.addComponents(modalRow); 

    await interaction.showModal(modal);
}


if (interaction.isModalSubmit() && interaction.customId === 'emoji_modal') {
    const emoji = interaction.fields.getTextInputValue('emoji_input');
    const data = loadData();
    const langCode = data[interaction.guildId]?.language || 'EN';
    const lang = loadLanguage(langCode);

    if (!data[interaction.guildId]) {
        data[interaction.guildId] = {}
    }
    data[interaction.guildId].emoji = emoji;
    saveData();

    await interaction.reply({ content: `${lang.EmojiSaved}`, flags: MessageFlags.Ephemeral });

}


if (interaction.isModalSubmit() && interaction.customId === 'prompt_modal') {
    const prompt = interaction.fields.getTextInputValue('prompt_input');
    const data = loadData();
    const langCode = data[interaction.guildId]?.language || 'EN';
    const lang = loadLanguage(langCode);

    if (!data[interaction.guildId]) {
        data[interaction.guildId] = {};
    }
    data[interaction.guildId].prompt = prompt;
    saveData(data);

    await interaction.reply({ content: `${lang.PromptSaved}`, flags: MessageFlags.Ephemeral })
}

});


client.login(process.env.DISCORD_API)