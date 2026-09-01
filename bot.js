import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { getAiResponse } from './src/models.js';

getAiResponse([{ role: 'user', content: 'Say hello' }])
    .then(response => console.log('Final response:', response))
    .catch(error => console.log('Everything failed:', error));

