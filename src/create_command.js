import { REST, Routes, SlashCommandBuilder, EmbedBuilder } from "discord.js";

const aiCommand = new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Set the AI channel for this server')
    .addChannelOption(option =>
        option.setName('channel')
            .setDescription('The channel to use for AI conversations')
            .setRequired(true)
    )
    .setDefaultMemberPermissions(0)

const aiSettingsCommand = new SlashCommandBuilder()
    .setName('ai_settings')
    .setDescription('Change bot settings')
    .setDefaultMemberPermissions(0);


export {aiCommand, aiSettingsCommand}