# NevAI

A Discord bot that lets admins set an AI channel per server, mention it and it responds using free AI models, remembering the last 15 messages for context.

# Features

- Only the Discord server administrator can use `/ai`, `/ai_settings`, `/language`, and `/logs`.
- The bot responds using the AI models listed below.
- The bot supports vision models (image understanding).
- Responses are limited to 1500 characters.
- Pre-built Docker image available.
- Custom success and error emoji.
- The bot reacts with an emoji when responding in a Discord chat.
- The server administrator can set a custom AI prompt.
- Multi-language support ([add your own language](./CONTRIBUTING.md)).
- The bot saves the last 15 messages for chat context.
- Live logs support (`/logs` command).

# AI models list

**Gemini**
- gemini-2.5-flash
- gemini-2.5-flash-lite

**Groq**
- openai/gpt-oss-120b 
- openai/gpt-oss-20b

**HackClub**
- meta-llama/llama-3.3-70b-instruct

---

## Models for vision

**Groq**
- qwen/qwen3.6-27b 
- qwen/qwen3.8-27b


# Commands

| **Commands** | **Description** |
|---|---|
| `/ai` | Set the channel where the AI will respond to mentions.|
| `/ai_settings` | Open the settings panel to customize the AI prompt and reaction emoji. |
| `/language` | Change the bot's response language. |
| `/logs` | Set the channel where AI response logs will be sent. |
| `/help` | List of commands in embed format |



# Requirements

### API
**Minimum 1 of the listed AI APIs:**

- [Groq API](https://console.groq.com/keys)
- [Gemini API](https://aistudio.google.com/api-keys)
- [HackClub API](https://ai.hackclub.com/keys)

You'll also need a [Discord Application](https://discord.com/developers/applications) to get your bot token.

## Env

```
GROQ_API=
GEMINI_API=
HACKCLUB_API=
DISCORD_API=
```

# Running

## Docker
1. Create `.env` file

```
docker pull ghcr.io/nahida4479/nevai:latest
docker run --env-file .env ghcr.io/nahida4479/nevai:latest 
```

## Running without Docker

``` bash
git clone https://github.com/Nahida4479/NevAI-Bot.git
cd NevAI-Bot
npm install
nano .env 
node bot.js
```

# License 
[**MIT LICENSE**](./LICENSE)