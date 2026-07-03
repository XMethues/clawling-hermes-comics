# syntax=docker/dockerfile:1
# Tested with oven/bun:1.3.14 and oven/bun:1.3.14-slim.
ARG BUN_VERSION=1.3.14

FROM oven/bun:${BUN_VERSION} AS builder
ARG DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy only workspace manifests first so dependency resolution is reproducible and cacheable.
COPY package.json bun.lock ./
COPY apps/crawler/package.json apps/crawler/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/db/package.json packages/db/package.json
RUN bun install --frozen-lockfile --linker=hoisted

COPY . .

FROM oven/bun:${BUN_VERSION}-slim AS runner
ARG DEBIAN_FRONTEND=noninteractive
WORKDIR /app
ENV NODE_ENV=production \
    HOME=/home/bun \
    DB_FILE_NAME=/app/data/comics.sqlite \
    CRAWLEE_STORAGE_DIR=/app/storage/crawler \
    PRODUCTION_CRAWLER_LOCK_FILE=/app/data/crawler-production.lock \
    PRODUCTION_CRAWLER_LOG_DIR=/app/logs/crawler \
    PRODUCTION_CRAWLER_BACKUP_DIR=/app/data/backups \
    PRODUCTION_CRAWLER_SUMMARY_PATH=/app/data/last-production-summary.json \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libcairo2 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    procps \
  && (apt-get install -y --no-install-recommends libasound2 || apt-get install -y --no-install-recommends libasound2t64) \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=1000:1000 /app /app

# Runtime browser initialization wrapper: same ensureBinary flow used by tests' waitForBrowser().
RUN rm -rf /app/apps/crawler/node_modules /app/apps/mcp-server/node_modules /app/packages/db/node_modules \
  && mkdir -p /app/data /app/storage/crawler /app/logs/crawler /home/bun \
  && chown -R 1000:1000 /app /home/bun \
  && printf '%s\n' '#!/bin/sh' 'set -eu' 'cd /app' 'exec bun run --filter @comics/crawler browser:install' > /usr/local/bin/comics-browser-install \
  && chmod 0755 /usr/local/bin/comics-browser-install

USER 1000
ENTRYPOINT ["bun", "run"]
CMD ["--filter", "@comics/crawler", "production:run"]
