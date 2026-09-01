import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { getAiResponse } from './src/models.js';
import { aiCommand } from './src/create_command.js';

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


getAiResponse([{ role: 'user', content: 'Say hello' }])
    .then(response => console.log('Final response:', response))
    .catch(error => console.log('Everything failed:', error));


client.login(process.env.DISCORD_API)