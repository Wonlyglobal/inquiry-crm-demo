FROM docker.m.daocloud.io/library/node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm config set registry https://registry.npmmirror.com && npm install --omit=dev
COPY src ./src
CMD ["npm","start"]
