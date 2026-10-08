import fs from 'fs';
import { SlashCommandBuilder } from 'discord.js';
import { debug_log_success, debugging } from '../debug/debug.js';

function loadLanguage(langCode) {
    const raw = fs.readFileSync(`./locales/languages/${langCode}.json`, 'utf-8');
    debugging(`Load languages: ${langCode}`)
    return JSON.parse(raw);
}



const languageCommand = new SlashCommandBuilder()
    .setName('language')
    .setDescription('Choose bot language')
    .addStringOption(option => 
        option.setName('lang')
            .setDescription('Set bot language')
            .setRequired(true)
            .addChoices(
                { name: 'English (default)', value: 'EN' },
                { name: 'Polish', value: 'PL' }
                // { name: 'YourLanguage', value: '' }
            )
    )




export { loadLanguage, languageCommand }