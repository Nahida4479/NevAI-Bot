# Contributing a new language

1. Copy `locales/languages/AddYourLanguage_example.json` to
   `locales/languages/<CODE>.json` (e.g. `DE.json` for German).
   Use the language's ISO code, uppercase, matching the existing
   convention (`EN`, `PL`).

2. Translate every key's value into your language. 

3. Register your language so it shows up in `/language`: open
   `locales/languages.js` and add a new choice to
   `languageCommand`:

```js
   .addChoices(
       { name: 'English (default)', value: 'EN' },
       { name: 'Polish', value: 'PL' },
       { name: 'Your Language', value: 'XX' }
   )
```

4. Test locally: run the bot, use `/language` to switch to your
   new code, and check every command/embed for missing text.

5. Open a Pull Request.