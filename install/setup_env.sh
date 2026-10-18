#!/bin/bash
set -e

echo "Your input will be hidden while typing"

: > .env.tmp

ask() {
    local name="$1"
    local required="$2"
    local value=""
    while true; do
        read -r -s -p "$name: " value < /dev/tty
        echo
        if [ -n "$value" ] || [ "$required" != "yes" ]; then
            break
        fi
        echo "This value is required."
    done
    printf '%s=%s\n' "$name" "$value" >> .env.tmp
}

ask_visible() {
    local name="$1"
    local hint="$2"
    local value=""
    read -r -p "$name ($hint): " value < /dev/tty
    printf '%s=%s\n' "$name" "$value" >> .env.tmp
}

ask_limit() {
    local name="$1"
    local default="$2"
    local value=""
    while true; do
        read -r -p "$name (Enter = $default): " value < /dev/tty
        value=${value:-$default}
        if [[ "$value" =~ ^[0-9]+$ ]]; then
            break
        fi
        echo "Please enter a whole number (0 = no limit)."
    done
    printf '%s=%s\n' "$name" "$value" >> .env.tmp
}

has_key() {
    grep -qE "^$1=.+" .env.tmp
}

ask DISCORD_API yes
ask GROQ_API no
ask GEMINI_API no
ask HACKCLUB_API no
ask OPENROUTER_API no
ask ANTHROPIC_API no
ask EXA_API no
ask GENERATE_IMAGE_API no
ask_visible OLLAMA_URL "optional, Enter = http://127.0.0.1:11434"
ask_visible OLLAMA_MODEL "optional, Enter = first model found"

if has_key EXA_API && has_key ANTHROPIC_API; then
    echo ""
    echo "Infographic limits (per day, 0 = no limit):"
    ask_limit INFOGRAPHIC_DAILY_LIMIT_USER 5
    ask_limit INFOGRAPHIC_DAILY_LIMIT_GLOBAL 30
    ask_limit INFOGRAPHIC_MAX_PARALLEL 5
fi

if has_key GENERATE_IMAGE_API; then
    echo ""
    echo "Image generation limits (per day, 0 = no limit):"
    ask_limit GENERATE_IMAGE_LIMIT_USER 5
    ask_limit GENERATE_IMAGE_LIMIT_GLOBAL 10
    ask_limit GENERATE_IMAGE_LIMIT_PARALLEL 10
fi

printf 'DEBUG_MODE=true\n' >> .env.tmp

OLLAMA_CHECK_URL=$(grep -E '^OLLAMA_URL=' .env.tmp | cut -d= -f2-)
OLLAMA_CHECK_URL=${OLLAMA_CHECK_URL:-http://127.0.0.1:11434}

if ! grep -qE '^(GROQ_API|GEMINI_API|HACKCLUB_API|OPENROUTER_API|ANTHROPIC_API)=.+' .env.tmp \
    && ! curl -sf --max-time 2 "$OLLAMA_CHECK_URL/api/tags" > /dev/null; then
    echo "Error: add at least one AI API key (Groq, Gemini, HackClub, OpenRouter or Anthropic) or run Ollama."
    rm -f .env.tmp
    exit 1
fi

mv .env.tmp .env
chmod 600 .env
echo "Saved to .env"