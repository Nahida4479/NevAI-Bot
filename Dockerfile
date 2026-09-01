FROM node:22

WORKDIR /NevAI

COPY . .

RUN npm install

CMD ["node", "bot.js"]