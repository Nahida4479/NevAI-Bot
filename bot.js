import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, MessageFlags, ButtonStyle, ButtonBuilder, ActionRowBuilder, Message, ModalBuilder, TextInputBuilder, TextInputStyle, MessageCollector } from 'discord.js';
import { getAiResponse, getVisionAiResponse } from './src/models.js';
import { aiCommand, aiSettingsCommand, logsCommand, helpCommand } from './src/create_command.js';
import { saveData, loadData } from './src/save_data.js';
import { loadLanguage, languageCommand } from './locales/languages.js';
import { Models } from 'groq-sdk/resources';
import { getEmoji } from './src/exportEmoji.js';
import { ensureEmojis } from './src/uploadEmoji.js';
// Debug
import { debugging } from './debug/debug.js';
import { styleText } from 'node:util';
import { json } from 'node:stream/consumers';

if (!process.env.DISCORD_API) {
    const err_message = 'DISCORD_API not detected. Please add your API!'
    console.warn(styleText(['red', 'bold'], err_message))
    debugging(JSON.stringify(err_message))
    process.exit(1)
} else {
    console.log(styleText(['green', 'bold'], 'DISCORD_API successful detected'))
}

if (!process.env.GROQ_API && !process.env.GEMINI_API && !process.env.HACKCLUB_API && !process.env.OPENROUTER_API) {
    const err_message = 'No AI API found. Add at least one API (Groq, Gemini, HackClub, OpenRouter)'
    console.warn(styleText(['red', 'bold'], err_message))
    debugging(JSON.stringify(err_message))
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildEmojisAndStickers
    ]
})

process.on('unhandledRejection', (reason) => {
    console.log(reason);
});

process.on('uncaughtException', (reason) => {
    console.log(reason);
})

client.once('clientReady', async () => {
    if (!process.env.GEMINI_API) {
        console.warn(styleText(['yellow', 'bold'], 'GEMINI_API not detected'))
    } else {
        console.log(styleText(['green', 'bold'], 'GEMINI_API successful detected'))
    }

    if (!process.env.GROQ_API) {
        console.warn(styleText(['yellow', 'bold'], 'GROQ_API not detected'))
    } else {
        console.log(styleText(['green', 'bold'], 'GROQ_API successful detected'))
    }

    if (!process.env.HACKCLUB_API) {
        console.warn(styleText(['yellow', 'bold'], 'HACKCLUB_API not detected'))
    } else {
        console.log(styleText(['green', 'bold'], 'HACKCLUB_API successful detected'))
    }

    if (!process.env.OPENROUTER_API) {
        console.warn(styleText(['yellow', 'bold'], 'OPENROUTER_API not detected'))
    } else {
        console.log(styleText(['green', 'bold'], 'OPENROUTER_API successful detected'))
    }

    console.log(`Login as ${client.user.tag}`)
    if (process.env.DEBUG_MODE) console.warn(styleText(['yellow', 'bold'], `You are using a version with debug settings enabled.`))
    await ensureEmojis(client);
    console.log(client.application.emojis.cache.map(e => e.name));

    await client.application.commands.set([aiCommand.toJSON(), languageCommand.toJSON(), aiSettingsCommand.toJSON(), logsCommand.toJSON(), helpCommand.toJSON()]);
    console.log('Command /ai /language /ai_settings /logs /help registered');
})


client.on('messageCreate', async (message) => {
    console.log('Message received:', message.content, 'from channel', message.channelId);
    const serverEmoji = message.guild.emojis.cache.map(e => `${e.name}: ${e}`).join(', ')

    if (message.author.bot) {
        const err_message1 = 'The bot tried to reply to another bot. Stop action!'
        console.warn(styleText(['yellow', 'bold'], err_message1))
        debugging(JSON.stringify(err_message1))
        return;
    }
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

    if (message.channelId !== guildData.channel) {
        const err_channel_message = 'The bot tried to respond on an undefined AI channel.'
        console.warn(styleText(['yellow', 'bold'], err_channel_message))
        debugging(JSON.stringify(err_channel_message))
        return;
    }
    if (!message.mentions.has(client.user)) return;
    console.log('Bot was mentioned on the correct channel');

    if (!guildData.history) {
        guildData.history = [];
    }

    guildData.history.push({ role: 'user', content: message.content });

    const basePrompt = `You are a assistand named NevAI. Use markdown and keep your answer brief and under 1500 characters. You can use these custom server emojis (if exists) when relevant: ${serverEmoji}. `
    const systemPrompt = `${basePrompt}\n\n ${guildData.prompt}` || 'You are a assistand named NevAI. Use markdown and keep your answer brief and under 1500 characters. ';
    const messageToSend = [
        { role: 'system', content: systemPrompt },
        ...guildData.history
    ]

    await message.channel.sendTyping();
    try {
        await message.react(guildData.emoji || '🤔')
    } catch (err) {
        console.log(`Discord react emoji error: ${err}`);
        debugging(JSON.stringify(messageToSend))
        await message.react('🤔')
    }
    
    let response;
    if (message.attachments.size > 0) {
        const attachment = message.attachments.filter(a => a.contentType?.startsWith('image/')).map(a => a.url); 
        const imageParts = attachment.map(url => ({ type: "image_url", image_url: { url } }))
        const textPart = { type: "text", text: message.content };
        const createPart = [textPart, ...imageParts]

        const visionMessage = [
            ...messageToSend.slice(0, -1),
            { role: 'user', content: createPart}
        ];
        try {
        response = await getVisionAiResponse(visionMessage)
        } catch (err) {
            console.log(err);
            await message.reactions.removeAll();
            await message.reply({ content: `${getEmoji(client, 'error')} ${lang.unsuportedImage}`});
            return;
        }
    } else {
        try {
        response = await getAiResponse(messageToSend)
        } catch (err) {
            console.log(err);
            await message.reactions.removeAll();
            await message.reply({ content: `${getEmoji(client, 'error')} ${lang.aiResponseError}` });
            return;
        }
    }

    if (guildData.logschannel) {
        const logChannel = client.channels.cache.get(guildData.logschannel)

        const logEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .addFields(
                { name: 'User message', value: message.content || `${lang.noMessageContent}`},
                { name: 'Model', value: response.model},
            )
            .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] })
    }

    guildData.history.push({ role: 'assistant', content: response.content });

    if (guildData.history.length > 15) {
        guildData.history = guildData.history.slice(-15);
    }

    data[message.guildId] = guildData;
    saveData(data);

    await message.reply(response.content)
    await message.reactions.removeAll();
    
})


client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'ai') {
        const data = loadData()
        const langCode = data[interaction.guildId]?.language || 'EN';
        const lang = loadLanguage(langCode);

        if (!interaction.memberPermissions.has('Administrator')) {
            await interaction.reply({ content: `${ getEmoji(client, 'error') } ${lang.onlyOwner}`, flags: MessageFlags.Ephemeral });
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
                await interaction.reply({ content: `${ getEmoji(client, 'success') } ${lang.aiChannelRemoved} ${channel}`, flags: MessageFlags.Ephemeral});
            } else {
                data[interaction.guildId].channel = channel.id;
                saveData(data);
                await interaction.reply({ content: `${getEmoji(client, 'success')} ${lang.aiChannelSet} ${channel}`, flags: MessageFlags.Ephemeral });
            }
        }
    }
    
if (interaction.commandName === 'logs') {
    const data = loadData();
    const langCode = data[interaction.guildId]?.language || 'EN';
    const lang = loadLanguage(langCode);

    if (!interaction.memberPermissions.has('Administrator')) {
        await interaction.reply({ content: `${getEmoji(client, 'error')} ${lang.onlyOwner}`, flags: MessageFlags.Ephemeral})
        return;
    }

    const channel = interaction.options.getChannel('logschannel');

    if (channel) {
        if (!data[interaction.guildId]) {
            data[interaction.guildId] = {};
        }

        if (data[interaction.guildId].logschannel === channel.id) {
            delete data[interaction.guildId].logschannel;
            saveData(data)
            await interaction.reply({ content: `${getEmoji(client, 'success')} ${lang.logsChannelRemoved}`, flags: MessageFlags.Ephemeral})
        } else {
            data[interaction.guildId].logschannel = channel.id;
            saveData(data)
            await interaction.reply({ content: `${getEmoji(client, 'success')} ${lang.setLogsChannel}`, flags: MessageFlags.Ephemeral})
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
    await interaction.reply({ content: `${getEmoji(client, 'success')} Language set to ${lang}`, flags: MessageFlags.Ephemeral });
}



if (interaction.commandName === 'ai_settings') {
    if (!interaction.memberPermissions.has('Administrator')) {
        await interaction.reply({ content: `${getEmoji(client, 'error')} ${lang.onlyOwner}`, flags: MessageFlags.Ephemeral});
        return;
    }
    const data = loadData()
    const langCode = data[interaction.guildId]?.language || 'EN';
    const lang = loadLanguage(langCode);

    const embed = new EmbedBuilder()
        .setAuthor({ name: 'NevAI', iconURL: 'https://cdn.hackclub.com/01a06e42-3b6f-7248-b3f9-b82a2612d31e/nevai-logo-512.png' })
        // .setTitle(lang.SettingsTitle)
        // .setTitle(lang.setPromptButton)
        .setDescription(lang.setPromptButton)
        .setColor(0xD65940)
        .setImage('https://cdn.hackclub.com/01a06e85-6953-7166-b71d-64361d6a0f29/nevai-settings-banner.png')
        .setTimestamp();

    const button = new ButtonBuilder()
        .setCustomId('open_prompt')
        .setLabel(lang.setPrompt)
        .setStyle(ButtonStyle.Danger)

    const emoji_button = new ButtonBuilder()
        .setCustomId('emoji_button')
        .setLabel(lang.AddEmoji)
        .setStyle(ButtonStyle.Danger)

    const row = new ActionRowBuilder().addComponents(button);
    const row_emoji = new ActionRowBuilder().addComponents(emoji_button);
    
    await interaction.reply({ embeds: [embed], components: [row, row_emoji], flags: MessageFlags.Ephemeral})
    }
}

if (interaction.commandName === 'help') {
    const data = loadData()
    const langCode = data[interaction.guildId]?.language || 'EN';
    const lang = loadLanguage(langCode);

    const helpEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle('Bot Commands')
        .addFields(
            { name: '`/ai`', value: `${lang.aicommands}`},
            { name: '`/ai_settings`', value: `${lang.aisettingscommand}`},
            { name: '`/language`',value: `${lang.languagecommand}`},
            { name: '`/logs`', value: `${lang.logscommand}`}
        );

        await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
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

    const customDiscordEmoji = /^<a?:\w+:(\d+)>$/;
    const rawIdRegex = /^\d+$/;
    const match = emoji.match(customDiscordEmoji);
    const isEmoji = /^\p{Extended_Pictographic}+$/u;


    let emojiToSave;
    if (match) {
        emojiToSave = match[1];
    } else if (isEmoji.test(emoji)) {
        emojiToSave = emoji; 
    } else if (rawIdRegex.test(emoji)) {
        emojiToSave = emoji;
    } else {
        await interaction.reply({ content: `${getEmoji(client, 'error')} ${lang.invalidEmoji}`, flags: MessageFlags.Ephemeral });
        return;
    }

    if (!data[interaction.guildId]) {
        data[interaction.guildId] = {}
    }
    data[interaction.guildId].emoji = emojiToSave;
    saveData(data);

    await interaction.reply({ content: `${getEmoji(client, 'success')} ${lang.EmojiSaved}`, flags: MessageFlags.Ephemeral });

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

    await interaction.reply({ content: `${getEmoji(client, 'success')} ${lang.PromptSaved}`, flags: MessageFlags.Ephemeral })
}

});


client.login(process.env.DISCORD_API)