ARG NODE_BASE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim
FROM ${NODE_BASE_IMAGE}
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install --global pnpm@11.19.0 --ignore-scripts \
    && pnpm install --prod --frozen-lockfile --ignore-scripts
COPY src ./src
CMD ["npm","start"]
