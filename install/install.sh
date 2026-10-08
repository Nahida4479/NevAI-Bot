#!/bin/bash
set -e

REPO_RAW="https://raw.githubusercontent.com/Nahida4479/NevAI-Bot/main"
INSTALL_DIR="$HOME/nevai"

if ! command -v docker &> /dev/null; then
      if [ "$(uname -s)" != "Linux" ]; then
        echo "Error: Docker is not installed."
        echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop"
        exit 1
    fi

    read -r -p "Docker is not installed. Install it now? (y/n): " answer < /dev/tty
    if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then 
    echo "Docker is required!!!"
    exit 1
    fi

    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm -f get-docker.sh
fi

if ! docker compose version &> /dev/null && ! sudo docker compose version &> /dev/null; then
echo "Error: Docker Compose plugin is not availiable."
exit 1
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

curl -fsSL -o docker-compose.yml "$REPO_RAW/docker-compose.yml"

touch data.json

curl -fsSL -o setup_env.sh "$REPO_RAW/install/setup_env.sh"
if [ ! -f .env ]; then
    bash setup_env.sh
fi

if [ ! -f .env ]; then
    echo "Error: required .env file is missing"
    exit 1
fi

if ! grep -q '^DISCORD_API=.\+' .env; then
    echo "Error: DISCORD_API is empty in .env"
    exit 1
fi

if docker info &> /dev/null; then
    DOCKER="docker"
else
    DOCKER="sudo docker"
fi

$DOCKER compose up -d
echo "NevAI project is running. Check logs with: docker logs nevai"
