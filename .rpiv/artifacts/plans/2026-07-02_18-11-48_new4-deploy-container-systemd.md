---
date: 2026-07-02T18:11:48+0800
author: unknown
commit: 3e8a59b
branch: fix/new4-deploy
repository: clawling-hermes-comics
topic: "NEW-4 deployable crawler container and systemd packaging"
tags: [plan, deploy, container, systemd]
status: ready
parent: .rpiv/artifacts/research/2026-07-02_18-11-48_new4-deploy-container-systemd.md
phase_count: 4
phases:
  - { n: 1, title: Container image foundation }
  - { n: 2, title: Compose services and backup sidecar }
  - { n: 3, title: Production runner container smoke support }
  - { n: 4, title: Systemd units and Chinese runbook }
unresolved_phase_count: 0
last_updated: 2026-07-02T18:11:48+0800
last_updated_by: unknown
---

# NEW-4 Deployable Crawler Container and Systemd Packaging Implementation Plan

## Overview
Package the existing Bun crawler and MCP HTTP server into an ops-runnable deployment shape: a reproducible non-root container image, compose services for crawler/MCP/backup, systemd one-shot scheduling, and Chinese operations documentation. The implementation keeps crawler core, MCP tool registration, and DB schema untouched; only deployment boundary files and allowed production runner support are changed.

## Requirements
- Add a multi-stage Dockerfile using a fixed Bun 1.x tag and `bun install --frozen-lockfile`.
- Run the container as UID 1000 and install CloakBrowser/Playwright runtime libraries.
- Add compose services: `crawler`, `mcp-server`, and a profile-gated one-shot `backup` sidecar.
- Add `.containerignore` and `.dockerignore` excluding dependencies, git data, `.rpiv`, local SQLite data, storage, logs, and tests.
- Add `deploy/systemd/comics-crawler.service` and `.timer`.
- Add Chinese deployment documentation covering local run, daemon run, stop, upgrade, data, systemd, troubleshooting, and cron frequency.
- Preserve scope: no MCP tool registration changes, no crawler core/site/storage changes, no DB schema/migration changes, no test rewrites.
- Validate the eight acceptance checks from the issue.

## Current State Analysis

### Key Discoveries
- Root package scripts already delegate to workspace package scripts (`package.json:10-17`).
- Crawler production entrypoints already exist (`apps/crawler/package.json:15-16`).
- MCP server already supports env-driven host/port and `/health` (`apps/mcp-server/src/env.ts:39-46`, `apps/mcp-server/src/index.ts:24-41`).
- Production runner already has migration/browser/backup/summary hooks (`apps/crawler/src/scripts/production.ts:373-440`, `apps/crawler/src/scripts/production.ts:891-904`).
- Container runtime needs a Bun-compatible migration escape hatch because Drizzle's native `better-sqlite3` path is not usable under Bun in this image.

## Desired End State
Operators can run:

```bash
podman build -t comics-crawler:dev .
podman compose up crawler
podman compose up -d mcp-server
curl http://localhost:${MCP_PORT:-3000}/health
podman compose --profile backup up backup
```

Remote systemd can install:

```bash
sudo cp deploy/systemd/comics-crawler.service deploy/systemd/comics-crawler.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now comics-crawler.timer
```

## What We're NOT Doing
- No changes to `apps/mcp-server/src/server.ts` or MCP tool registration.
- No changes to crawler core files: `apps/crawler/src/crawler.ts`, `storage.ts`, or `sites/**`.
- No DB schema or migration edits under `packages/db/**`.
- No nginx/reverse proxy because the MCP port is directly exposed.
- No MySQL/Postgres; SQLite remains the only persistence target.
- No push or PR from this workflow.

## Decisions

### Use fixed Bun image tag
Decision: use `oven/bun:1.3.14` and `oven/bun:1.3.14-slim`, matching `.mise.toml:2`, and document that tag in the Dockerfile comment.

### Use package-filtered commands
Decision: compose and systemd call `bun run --filter @comics/crawler production:run` or `bun run --filter @comics/mcp-server start`, following root and package scripts (`package.json:10-17`, `apps/crawler/package.json:15-16`, `apps/mcp-server/package.json:7`).

### Add env-gated container migration fallback
Decision: add `PRODUCTION_CRAWLER_USE_BUN_SQLITE_MIGRATE` for compose so the current initial SQL can be applied via `bun:sqlite` in containers while local/systemd runs keep the existing Drizzle migration path.

### Add env-gated network skip for smoke tests
Decision: add `PRODUCTION_CRAWLER_SKIP_NETWORK` to the production runner so acceptance can exercise migrate/backup/summary flow without hitting target sites.

### Keep MCP registration untouched
Decision: use existing env parsing and `/health`; do not edit `apps/mcp-server/src/server.ts`.

## Phase 1: Container image foundation

### Overview
Add the reproducible non-root runtime image. This phase is foundational and must precede compose validation.

### Changes Required:

#### 1. Dockerfile
**File**: `Dockerfile`
**Changes**: NEW — multi-stage Bun image using fixed tag, hoisted frozen install, CloakBrowser runtime libraries, non-root UID 1000, browser-init wrapper, and `bun run` entrypoint.

```dockerfile
# syntax=docker/dockerfile:1
# Tested with oven/bun:1.3.14 and oven/bun:1.3.14-slim.
ARG BUN_VERSION=1.3.14

FROM oven/bun:${BUN_VERSION} AS builder
ARG DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

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
    ca-certificates fonts-liberation libatk-bridge2.0-0 libcairo2 libcups2 \
    libdrm2 libgbm1 libnss3 libpango-1.0-0 libx11-6 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 libxss1 \
  && (apt-get install -y --no-install-recommends libasound2 || apt-get install -y --no-install-recommends libasound2t64) \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=1000:1000 /app /app

RUN rm -rf /app/apps/crawler/node_modules /app/apps/mcp-server/node_modules /app/packages/db/node_modules \
  && mkdir -p /app/data /app/storage/crawler /app/logs/crawler /home/bun \
  && chown -R 1000:1000 /app /home/bun \
  && printf '%s\n' '#!/bin/sh' 'set -eu' 'cd /app' 'exec bun run --filter @comics/crawler browser:install' > /usr/local/bin/comics-browser-install \
  && chmod 0755 /usr/local/bin/comics-browser-install

USER 1000
ENTRYPOINT ["bun", "run"]
CMD ["--filter", "@comics/crawler", "production:run"]
```

#### 2. .containerignore and .dockerignore
**File**: `.containerignore`, `.dockerignore`
**Changes**: NEW — exclude local dependencies, VCS/workflow data, data SQLite files, storage, logs, tests, and local env files.

```text
node_modules
node_modules/
.git
.git/
.rpiv
.rpiv/
data/*.sqlite*
/data/*.sqlite*
storage
storage/
logs
logs/
**/__tests__
**/__tests__/
.env
.env.*
!.env.example
Dockerfile
*.log
coverage/
playwright-report/
test-results/
```

### Success Criteria:

#### Automated Verification:
- [x] Image builds: `docker build -t comics-crawler:dev .` exits 0.
- [x] Container uses non-root UID: Dockerfile contains `USER 1000`.
- [x] In-container crawler typecheck passes: `docker run --rm comics-crawler:dev bun run --filter @comics/crawler typecheck` exits 0.
- [x] Image size is below 1.5GB: `docker images comics-crawler:dev` reports `1.07GB`.

#### Manual Verification:
- [x] Dockerfile comment documents the tested Bun tag.
- [x] No `latest` image tag is used for the application image.

## Phase 2: Compose services and backup sidecar

### Overview
Add compose wiring for crawler, MCP HTTP server, and one-shot backup sidecar. Depends on Phase 1.

### Changes Required:

#### 1. docker-compose.yml
**File**: `docker-compose.yml`
**Changes**: NEW — `crawler`, `mcp-server`, and profile-gated `backup` services with named data/storage/log volumes.

```yaml
services:
  crawler:
    image: comics-crawler:dev
    command: ["--filter", "@comics/crawler", "${PRODUCTION_CRAWLER_SCRIPT:-production:run}"]
    volumes:
      - comics-data:/app/data
      - comics-storage:/app/storage
      - comics-logs:/app/logs
    restart: unless-stopped
  mcp-server:
    image: comics-crawler:dev
    command: ["--filter", "@comics/mcp-server", "start"]
    ports:
      - "${MCP_PORT:-3000}:${MCP_PORT:-3000}"
    volumes:
      - comics-data:/app/data:ro
    healthcheck:
      test: ["CMD-SHELL", "bun -e \"const port=process.env.MCP_PORT||'3000'; const r=await fetch('http://127.0.0.1:'+port+'/health'); process.exit(r.ok?0:1)\""]
  backup:
    profiles: ["backup"]
    command: ["apps/crawler/src/scripts/backup.ts"]
```

#### 2. apps/crawler/src/scripts/backup.ts
**File**: `apps/crawler/src/scripts/backup.ts`
**Changes**: NEW — copy SQLite database, WAL, and SHM files into `PRODUCTION_CRAWLER_BACKUP_DIR` and print a JSON result.

```ts
const dbEnv = getDbEnv();
const dbFileName = resolveFromRoot(root, dbEnv.fileName);
const backupDir = resolveFromRoot(root, envString("PRODUCTION_CRAWLER_BACKUP_DIR", "data/backups"));
const copied = backupSqlite(dbFileName, backupDir);
console.info(JSON.stringify({ status: "succeeded", generatedAt: nowIso(), dbFileName, backupDir, files: copied }, null, 2));
```

### Success Criteria:

#### Automated Verification:
- [x] Compose config validates: `docker compose config --quiet` exits 0.
- [x] MCP server starts and healthcheck target returns 200: `curl -fsS http://localhost:3000/health` returns JSON with `"ok":true`.
- [x] Backup sidecar runs once: `docker compose --profile backup run --rm backup` exits 0 and prints `"status": "succeeded"`.

#### Manual Verification:
- [x] `mcp-server` mounts `comics-data` read-only.
- [x] `backup` is profile-gated and not part of default `docker compose up`.

## Phase 3: Production runner container smoke support

### Overview
Add minimal env-gated support in the allowed production runner file so compose smoke tests can migrate, skip network, write summary JSON, and exit 0. Depends on Phases 1-2.

### Changes Required:

#### 1. apps/crawler/src/scripts/production.ts
**File**: `apps/crawler/src/scripts/production.ts`
**Changes**: MODIFY — add Bun SQLite migration fallback and skip-network synthetic run records.

```ts
if (envBoolean("PRODUCTION_CRAWLER_USE_BUN_SQLITE_MIGRATE", false)) {
  runBunSqliteMigrations(root);
  return;
}

if (envBoolean("PRODUCTION_CRAWLER_SKIP_NETWORK", false)) {
  return {
    site: site.id,
    mode,
    summary: {
      sourceKey: site.site.key,
      mode,
      crawlRunId: previousRunId,
      requestQueueName: "",
      status: "succeeded",
      total: 0,
      succeeded: 0,
      failed: 0,
      comicsStored: 0,
      tagsStored: 0,
      chaptersStored: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
      errors: [],
    },
    quality: createEmptyQualityStats(),
    findings: [],
    durationMs: Date.now() - startedAtMs,
  };
}
```

### Success Criteria:

#### Automated Verification:
- [x] Smoke compose run exits 0: `PRODUCTION_CRAWLER_SCRIPT=production:probe PRODUCTION_CRAWLER_SKIP_NETWORK=true PRODUCTION_CRAWLER_SKIP_BROWSER_INSTALL=true docker compose up --abort-on-container-exit --exit-code-from crawler crawler`.
- [x] Smoke run writes `/app/data/last-production-summary.json` with `overallStatus: "succeeded"` and two probe records.
- [x] Root quality gate passes: `bun run check` exits 0.

#### Manual Verification:
- [x] No crawler core/site/storage files are touched.
- [x] New envs are operational escape hatches for container smoke only.

## Phase 4: Systemd units and Chinese runbook

### Overview
Add local systemd scheduling and an ops-facing Chinese deployment guide. Depends on Phases 1-3.

### Changes Required:

#### 1. deploy/systemd/comics-crawler.service
**File**: `deploy/systemd/comics-crawler.service`
**Changes**: NEW — one-shot crawler unit using `EnvironmentFile` and package-filtered production script.

```ini
[Service]
Type=oneshot
User=colin
WorkingDirectory=/opt/comics-crawler
ExecStart=/usr/local/bin/bun run --filter @comics/crawler production:run
EnvironmentFile=/opt/comics-crawler/.env
TimeoutStartSec=21600
Nice=10
```

#### 2. deploy/systemd/comics-crawler.timer
**File**: `deploy/systemd/comics-crawler.timer`
**Changes**: NEW — daily 03:00 timer with randomized delay and persistence.

```ini
[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=900
Persistent=true
```

#### 3. deploy/README.md
**File**: `deploy/README.md`
**Changes**: NEW — Chinese deployment runbook covering prerequisites, foreground/background compose, stop, upgrade, data/backup, systemd, troubleshooting, and production frequency.

### Success Criteria:

#### Automated Verification:
- [x] systemd verify exits 0 in Debian container: `systemd-analyze verify /units/comics-crawler.service /units/comics-crawler.timer`.
- [x] README contains required sections: 前置条件、本地起一次、后台跑、停止、升级、数据与备份、systemd 启用、故障排查、生产 cron 频率建议.

#### Manual Verification:
- [x] No fish-specific PATH handling is added to systemd units.
- [x] README documents podman-first commands and Docker compatibility gap.

## Ordering Constraints
- Phase 1 must land before any compose validation.
- Phase 2 depends on the image command/entrypoint from Phase 1.
- Phase 3 depends on compose env wiring from Phase 2.
- Phase 4 can be authored after Phase 1 but final validation references all previous phases.

## Verification Notes
- Run Docker equivalents because this runner has Docker but no podman.
- Capture summary JSON from `comics-data` volume after crawler smoke.
- Verify MCP health after waiting for Bun server startup.
- Verify systemd units in a Debian container when host lacks `systemd-analyze`.
- Ensure no forbidden files are modified.

## Performance Considerations
- Image size target is under 1.5GB; measured image is 1.07GB.
- Runtime installs only browser libraries in runner; build toolchain stays in builder.
- `PRODUCTION_CRAWLER_SKIP_NETWORK` is only a smoke-test path and does not affect default production behavior.

## Migration Notes
- No schema migration files are added or changed.
- Container fallback applies existing SQL files only when `PRODUCTION_CRAWLER_USE_BUN_SQLITE_MIGRATE=true`.
- Default local/systemd migration path remains existing `@comics/db db:migrate`.

## Pattern References
- `package.json:10-17` — workspace filtering pattern.
- `apps/crawler/package.json:15-16` — production script names.
- `apps/crawler/src/__tests__/setup.ts:175-182` — browser install wait pattern.
- `apps/mcp-server/src/index.ts:24-41` — health endpoint and Bun listener.

## Developer Context
**Q (issue): Which workflow should be used?**
A: PM pinned `/wf build`, not `/wf ship` or `/wf arch`.

**Q (workflow): Any unresolved PM decisions?**
A: None; issue scope and PM comment were sufficiently specific.

## Plan History
- Phase 1: Container image foundation — approved as generated and implemented.
- Phase 2: Compose services and backup sidecar — approved as generated and implemented.
- Phase 3: Production runner container smoke support — approved as generated and implemented.
- Phase 4: Systemd units and Chinese runbook — approved as generated and implemented.

## References
- `.rpiv/artifacts/research/2026-07-02_18-11-48_new4-deploy-container-systemd.md`
- Issue NEW-4 description and PM workflow comment.
