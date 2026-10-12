FROM node:22

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*


WORKDIR /NevAI

COPY . .

RUN npm install

CMD ["node", "bot.js"]