import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getAiResponse } from './src/models.js';
import { aiCommand } from './src/create_command.js';
import { saveData, loadData } from './src/save_data.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

client.once('clientReady', async () => {
    console.log(`Login as ${client.user.tag}`)

    await client.application.commands.set([aiCommand.toJSON()]);
    console.log('Command /ai registered');
})


client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ai') {
        if (!interaction.memberPermissions.has('Administrator')) {
            await interaction.reply({ content: 'Only administrator can use this command.', flags: MessageFlags.Ephemeral });
            return;
        }

        const channel = interaction.options.getChannel('channel');

        if (channel) {
            const data = loadData();

            if(data[interaction.guildId] === channel.id) {
                delete data[interaction.guildId];
                saveData(data);
                await interaction.reply({ content: `AI channel removed`, flags: MessageFlags.Ephemeral});
            } else {
                data[interaction.guildId] = channel.id;
                saveData(data);
                await interaction.reply({ content: `AI channel set to ${channel}`, flags: MessageFlags.Ephemeral });
            }
        }
    }
})




client.login(process.env.DISCORD_API)