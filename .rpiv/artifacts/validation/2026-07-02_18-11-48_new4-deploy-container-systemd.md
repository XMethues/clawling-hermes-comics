---
date: 2026-07-02T18:11:48+0800
author: unknown
commit: 3e8a59b
branch: fix/new4-deploy
repository: clawling-hermes-comics
parent: .rpiv/artifacts/plans/2026-07-02_18-11-48_new4-deploy-container-systemd.md
tags: [validation, deploy, container, systemd]
topic: "Validation of NEW-4 deployable crawler container and systemd packaging"
status: ready
verdict: pass
---

# Validation: NEW-4 Deployable Crawler Container and Systemd Packaging

## Summary
Verdict: pass.

All eight issue acceptance checks were run with Docker equivalents because podman is unavailable on this runner. The implementation also passed the root check command and the backup sidecar smoke test.

## Phase Results

### Phase 1: Container image foundation
- Docker image builds successfully.
- Runtime image uses `USER 1000`.
- Image uses fixed `oven/bun:1.3.14` tag.
- In-container crawler typecheck passes.
- Image size is under 1.5GB.

### Phase 2: Compose services and backup sidecar
- Compose config validates.
- MCP server starts and `/health` returns JSON 200.
- Backup sidecar exits 0 and writes a backup file path.

### Phase 3: Production runner container smoke support
- Compose crawler smoke run exits 0.
- Migration path applies existing initial SQL through `bun:sqlite` in container.
- Smoke path skips target network and writes a successful summary with two probe records.

### Phase 4: Systemd units and Chinese runbook
- `systemd-analyze verify` returns 0 with no diagnostics in a Debian container.
- README includes required operational sections.

## Automated Verification

### 1. Image build
Command:

```bash
docker build -t comics-crawler:dev .
```

Exit code: 0

Key stdout/stderr:

```text
#22 naming to docker.io/library/comics-crawler:dev 0.0s done
#22 DONE 0.4s
```

### 2. Crawler compose smoke
Command:

```bash
PRODUCTION_CRAWLER_SCRIPT=production:probe \
PRODUCTION_CRAWLER_SKIP_NETWORK=true \
PRODUCTION_CRAWLER_SKIP_BROWSER_INSTALL=true \
docker compose up --abort-on-container-exit --exit-code-from crawler crawler
```

Exit code: 0

Key stdout:

```text
[production] Applying SQLite migration via bun:sqlite: 0000_initial_comic_catalog.sql
[production] Skipping CloakBrowser install check because PRODUCTION_CRAWLER_SKIP_BROWSER_INSTALL is true.
[production] Created 1 SQLite backup file(s).
[production] Starting Rouman5 probe.
[production] Skipping network crawler for Rouman5 probe because PRODUCTION_CRAWLER_SKIP_NETWORK is true.
[production] Starting 18comic Hanman probe.
[production] Skipping network crawler for 18comic Hanman probe because PRODUCTION_CRAWLER_SKIP_NETWORK is true.
[production] Wrote summary: /app/data/last-production-summary.json
[production] SUCCEEDED probe-only: 2 crawl run(s), 0 finding(s), summary /app/data/last-production-summary.json
```

Summary JSON from `comics-data`:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-02T10:16:24.445Z",
  "overallStatus": "succeeded",
  "records": [
    {
      "site": "18comic",
      "mode": "probe",
      "status": "succeeded",
      "crawlRunId": 0,
      "comicsStored": 0,
      "chaptersStored": 0,
      "failedRequests": 0,
      "durationMs": 0
    },
    {
      "site": "rouman5",
      "mode": "probe",
      "status": "succeeded",
      "crawlRunId": 0,
      "comicsStored": 0,
      "chaptersStored": 0,
      "failedRequests": 0,
      "durationMs": 0
    }
  ]
}
```

### 3. MCP health
Command:

```bash
docker compose up -d mcp-server
curl -fsS http://localhost:3000/health
```

Exit code: 0

Stdout:

```json
{"ok":true,"name":"comics-mcp-server","version":"0.1.0","transport":"streamable-http","schema":"catalog"}
```

### 4. systemd verify
Command:

```bash
docker run --rm -v "$PWD/deploy/systemd:/units:ro" debian:trixie-slim sh -lc 'apt-get update >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends systemd >/dev/null && useradd -m colin && mkdir -p /opt/comics-crawler /usr/local/bin && touch /opt/comics-crawler/.env && ln -sf /bin/true /usr/local/bin/bun && systemd-analyze verify /units/comics-crawler.service /units/comics-crawler.timer'
```

Exit code: 0

Stdout/stderr: no diagnostics.

### 5. README sections
Checked `deploy/README.md` includes required sections:

```text
1. 前置条件
2. 本地起一次（前台）
3. 后台跑
4. 停止
5. 升级
6. 数据与备份
7. systemd 启用（远端）
8. 故障排查
9. 生产 cron 频率建议
```

### 6. .containerignore exclusions
Command:

```bash
grep -E '^(node_modules|\.git|\.rpiv|data/\*\.sqlite\*|/data/\*\.sqlite\*|storage|logs|\*\*/__tests__)' .containerignore
```

Exit code: 0

Stdout:

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
```

### 7. Image size
Command:

```bash
docker images comics-crawler:dev --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}'
```

Exit code: 0

Stdout:

```text
REPOSITORY       TAG       IMAGE ID       SIZE
comics-crawler   dev       f2def70356e7   1.07GB
```

### 8. In-container crawler typecheck
Command:

```bash
docker run --rm comics-crawler:dev bun run --filter @comics/crawler typecheck
```

Exit code: 0

Stdout:

```text
@comics/crawler typecheck: Exited with code 0
```

## Additional Verification

### Root quality gate
Command:

```bash
bun run check
```

Exit code: 0

Stdout:

```text
$ biome check . && bun run typecheck
Checked 33 files in 44ms. No fixes applied.
$ bunx tsc --noEmit -p tsconfig.json
```

### Compose config
Command:

```bash
docker compose config --quiet
```

Exit code: 0

Stdout:

```text
docker compose config: ok
```

### Backup sidecar
Command:

```bash
docker compose --profile backup run --rm backup
```

Exit code: 0

Stdout:

```json
{
  "status": "succeeded",
  "generatedAt": "2026-07-02T10:17:16.747Z",
  "dbFileName": "/app/data/comics.sqlite",
  "backupDir": "/app/data/backups",
  "files": [
    "/app/data/backups/2026-07-02T10-17-16-746Z-comics.sqlite"
  ]
}
```

## Deviations from Plan
None.

## Potential Issues
- Podman is not installed in this runner; Docker equivalents were used.
- Because `crawler` has `restart: unless-stopped` as required, `docker compose up --abort-on-container-exit` logs one immediate restart before compose stops the service. The command still exits 0 and the summary JSON is valid.

## Manual Verification
- Confirmed no forbidden files were modified: no changes under `apps/mcp-server/src/server.ts`, crawler core/site/storage files, `packages/db/**`, or tests.
- Confirmed no nginx config was added.
