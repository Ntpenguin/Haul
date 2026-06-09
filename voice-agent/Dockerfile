# OpenVoice Agent — production image
FROM node:20-bookworm-slim AS base
WORKDIR /app

# better-sqlite3 needs a build toolchain for its native addon
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm install --no-audit --no-fund && npm run build

ENV NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
