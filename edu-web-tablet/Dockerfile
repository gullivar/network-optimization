FROM node:22-slim

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY dist/ ./dist/
COPY vite.config.ts .
COPY index.html .

CMD ["pnpm", "run", "preview", "--host", "0.0.0.0"]
