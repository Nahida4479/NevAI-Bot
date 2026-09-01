import { REST, Routes, SlashCommandBuilder } from "discord.js";

const aiCommand = new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Set the AI channel for this server')
    .addChannelOption(option =>
        option.setName('channel')
            .setDescription('The channel to use for AI conversations')
            .setRequired(true)
    )
    .setDefaultMemberPermissions(0)

export {aiCommand}