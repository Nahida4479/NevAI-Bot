import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, MessageFlags, ButtonStyle, ButtonBuilder, ActionRowBuilder, Message, ModalBuilder, TextInputBuilder, TextInputStyle, MessageCollector, AttachmentBuilder } from 'discord.js';
import { getAiResponse, getVisionAiResponse } from './src/models.js';
import { aiCommand, aiSettingsCommand, logsCommand, helpCommand } from './src/create_command.js';
import { saveData, loadData } from './src/save_data.js';
import { loadLanguage, languageCommand } from './locales/languages.js';
import { Models } from 'groq-sdk/resources';
import { getEmoji } from './src/exportEmoji.js';
import { ensureEmojis } from './src/uploadEmoji.js';
import { sendLogEmbed } from './src/logs_command.js';
// Debug
import { debugging, debug_log_err, debug_log_success, debug_log_warn } from './debug/debug.js';
import { styleText } from 'node:util';
import { readFileSync } from 'node:fs';
import net from 'node:net';
net.setDefaultAutoSelectFamily(false);

if (!process.env.DISCORD_API) {
    const err_message = 'DISCORD_API not detected. Please add your API!'
    debug_log_err(err_message)
    process.exit(1)
} else {
    const success_message = 'DISCORD_API successful detected'
    debug_log_success(success_message);
    const n_verson = process.version;
    const p_version = process.platform;
    console.log(styleText(['magenta', 'bold'], `Node version:${n_verson} System:${p_version}`))
    const pkg_read = JSON.parse(readFileSync('./package.json', 'utf-8'));
    debugging(`Environment: Node ${n_verson}, OS: ${p_version}, discord.js ${pkg_read.dependencies['discord.js']}`);
}

if (!process.env.GROQ_API && !process.env.GEMINI_API && !process.env.HACKCLUB_API && !process.env.OPENROUTER_API) {
    const err_message = 'No AI API found. Add at least one API (Groq, Gemini, HackClub, OpenRouter)'
    debug_log_err(err_message)
    process.exit(1);
} else {
    const success_message = 'AI models APIs found.'
    debugging(success_message)
    console.log(styleText(['blue', 'bold'], success_message))
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
    debug_log_err(reason)
    debugging(reason)
});

process.on('uncaughtException', (reason) => {
    debug_log_err(reason)
    debugging(reason)
})

client.once('clientReady', async () => {
    if (!process.env.GEMINI_API) {
        const warn_gemini = 'GEMINI_API not detected';
        debug_log_warn(warn_gemini)
    } 

    if (!process.env.GROQ_API) {
        const warn_groq = 'GROQ_API not detected';
        debug_log_warn(warn_groq);
    } 

    if (!process.env.EXA_API) {
        const warn_exe = 'EXA_API not detected. The bot will not be able to search for information on the internet.'
        debug_log_warn(warn_exe)
    }

    if (!process.env.HACKCLUB_API) {
        const warn_hackclub = 'HACKCLUB_API not detected';
        debug_log_warn(warn_hackclub)
    } 

    if (!process.env.OPENROUTER_API) {
        const warn_openrouter = 'OPENROUTER_API not detected';
        debug_log_warn(warn_openrouter);
    } 

    console.log(styleText(['magenta', 'bold'], `Login as ${client.user.tag}`))
    if (process.env.DEBUG_MODE) console.warn(styleText(['yellow', 'bold'], `You are using a version with debug settings enabled.`))
    await ensureEmojis(client);

    await client.application.commands.set([aiCommand.toJSON(), languageCommand.toJSON(), aiSettingsCommand.toJSON(), logsCommand.toJSON(), helpCommand.toJSON()]);
    console.log(styleText(['green', 'bold'], 'Command /ai /language /ai_settings /logs /help registered'));
})


client.on('messageCreate', async (message) => {
    const serverEmoji = message.guild.emojis.cache.map(e => `${e.name}: ${e}`).join(', ')

    if (message.author.bot) {
        const err_message1 = 'The bot tried to reply to another bot. Stop action!'
        debugging(err_message1);
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
        debug_log_warn(err_channel_message)
        return;
    }
    if (!message.mentions.has(client.user)) return;

    if (!guildData.history) {
        guildData.history = [];
    }

    const attachment_txt = message.attachments.filter(a => a.contentType?.startsWith('text/plain')).map(a => a.url);

    let txtContent = '';
    if (attachment_txt.length > 0) {
        const txtResponse = await fetch(attachment_txt[0]);
        txtContent = await txtResponse.text()
    }

    let messageContent = message.content;
    if (txtContent) {
        messageContent = `${messageContent}\n\nAttached file content: \n${txtContent}`;
    }

    guildData.history.push({ role: 'user', content: messageContent });

    const basePrompt = `You are an assistant named ${client.user.username}. Keep your answer brief and under 1200 characters. You have access to a search_web tool. For every specific fact (item name, character name, stat), you MUST indicate which search result it came from (e.g. "according to Result 1..."). CRITICAL: You are NOT allowed to answer questions about game characters, builds, or guides without calling search_web FIRST. When a fact from a source is conditional or context-specific (e.g. only true in a specific mode, event, or menu), preserve that condition explicitly rather than generalizing it into a universal statement. If you find yourself about to write specific stats, item names, or team compositions without having searched in this exact response, STOP and call search_web instead. If a detail isn't explicitly stated in any result, write "not specified in available sources" instead of inventing a name or number. In most cases, ONE search is ENOUGHT. You MUST call it before answering any question about: specific game characters, builds, guides, strategies, current events, prices, or anything you are not ABSOLUTELY certain about. If there is ANY doubt, treat yourself as not knowing the answer and search first - do not rely on your training data for these topics, as it may be outdated or wrong. You can use these custom server emojis (if exists) when relevant: ${serverEmoji}. Use only Discord-supported Markdown: *italic*, **bold**, ***bold italic***, # headers, \` inline code \`, \`\`\` code blocks \`\`\`, __underline__, ||spoiler||. NEVER use markdown tables (the | character for columns) or HTML tags like <br>. Reminder: never answer questions about specific games, characters, or builds without searching first.`;
    const systemPrompt = `${basePrompt}\n\n ${guildData.prompt}` || `You are a assistand named ${client.user.username}. Brief UNDER 1500 characters. `;
    const messageToSend = [
        { role: 'system', content: systemPrompt },
        ...guildData.history
    ]

    try {
        await message.react(guildData.emoji || '🤔')
    } catch (err) {
        const err_emojiss = `Discord react emoji error: ${err}`
        debug_log_err(err_emojiss)
        debugging(err)
        await message.react('🤔')
    }
    
    const startTime = Date.now()

    let response;
    if (message.attachments.size > 0) {
        const attachment = message.attachments.filter(a => a.contentType?.startsWith('image/')).map(a => a.url); 
        const imageParts = attachment.map(url => ({ type: "image_url", image_url: { url } }))
        const textPart = { type: "text", text: messageContent };
        const createPart = [textPart, ...imageParts]

        const visionMessage = [
            ...messageToSend.slice(0, -1),
            { role: 'user', content: createPart}
        ];
        try {
        response = await getVisionAiResponse(visionMessage)
        await message.reactions.removeAll();
        } catch (err) {
            const err_vision = `Vision models error: ${err}`
            debug_log_err(err_vision);
            debugging(err)
                await message.reactions.removeAll();
                await message.reply({ content: `${getEmoji(client, 'error')} ${lang.noVisionModels}`})
                await sendLogEmbed(client, guildData, 'AI error', 0xFF0000, [
                    { name: 'User message', value: message.content || `${lang.noMessageContent}` },
                    { name: 'Error type', value: 'Vision models failed' },
                    { name: 'Details', value: `\`${err}\``.slice(0, 200) }
                ]);
                return;
        }
    } else {
        try {
        response = await getAiResponse(messageToSend)
        await message.reactions.removeAll();
        } catch (err) {
            const err_vision = `ALL AI models error: ${err}`
            debug_log_err(err_vision);
            debugging(err)
            await message.reactions.removeAll();
            await message.reply({ content: `${getEmoji(client, 'error')} ${lang.aiResponseError}` });
            await sendLogEmbed(client, guildData, 'AI error', 0xFF0000, [
                { name: 'User message', value: message.content || `${lang.noMessageContent}` },
                { name: 'Error type', value: 'AI models failed' },
                { name: 'Details', value: `\`${err}\``.slice(0, 200) }
            ]);
            return;
        }
    }

    if (!response.content) {
        response.content = response.content || `${lang.responseErrors}`
    } else if (response.content.length > 2000) {
        response.content = response.content.slice(0, 1990) + "..."
    }
    debugging(` \n User: ${message.content} \n AI Response: ${response.content} \n Model: ${response.model}`)
    const duration = Date.now() - startTime;
    debugging(`[Guild: ${message.guildId} | Channel: ${message.channelId}] AI response time: ${duration}ms`)

    await sendLogEmbed(client, guildData, 'AI Response', 0xFFA500, [
        { name: 'User message', value: message.content || `${lang.noMessageContent}`},
        { name: 'Model', value: response.model },
        { name: 'Internet search', value: response.usedInternetSearch ? `${getEmoji(client, 'success')} ${lang.yes}` : `${getEmoji(client, 'error')} ${lang.no}` },
    ]);

    guildData.history.push({ role: 'assistant', content: response.content });

    if (guildData.history.length > 15) {
        guildData.history = guildData.history.slice(-15);
    }

    data[message.guildId] = guildData;
    saveData(data);

    const replyOption = { content: response.content, flags: MessageFlags.SuppressEmbeds };

    if (response.imageResult && response.imageResult.length > 0) {
        try {
        const imgResponse = await fetch(response.imageResult[0].imageUrl);
        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
        const attachment = new AttachmentBuilder(imgBuffer, { name: 'image.webp' });
        replyOption.files = [attachment];
        debugging(`Exa image: ${attachment}, ${imgResponse}, ${imgBuffer}`)
        } catch (err) {
            debugging(`Image attach failed: ${err}`);
        }
    }
    await message.reply(replyOption)
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