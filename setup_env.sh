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
        if [ -n "$value" ] || [ "required" != "yes" ]; then
            break
        fi
        echo "This value is required."
    done
    printf '%s=%s\n' "$name" "$value" >> .env.tmp
}

ask DISCORD_API yes
ask GROQ_API no
ask GEMINI_API no
ask HACKCLUB_API no
ask OPENROUTER_API no
ask EXA_API no
printf 'DEBUG_MODE=true\n' >> .env.tmp

mv .env.tmp .env
chmod 600 .env
echo "Saved to .env"