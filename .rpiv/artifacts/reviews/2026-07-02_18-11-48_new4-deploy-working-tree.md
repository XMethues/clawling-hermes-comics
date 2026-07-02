---
date: 2026-07-02T18:11:48+0800
reviewer: unknown
commit: 3e8a59b
branch: fix/new4-deploy
repository: clawling-hermes-comics
scope: working-tree
status: ready
blockers_count: 0
verification: manual review against working tree after validation
---

# Code Review: NEW-4 Deploy Working Tree

## Scope
Reviewed pending NEW-4 deployment changes:

- `Dockerfile`
- `.containerignore`
- `.dockerignore`
- `docker-compose.yml`
- `apps/crawler/src/scripts/backup.ts`
- `apps/crawler/src/scripts/production.ts`
- `deploy/systemd/comics-crawler.service`
- `deploy/systemd/comics-crawler.timer`
- `deploy/README.md`
- workflow artifacts under `.rpiv/artifacts/`

## Recommendation
Proceed with WIP commits. No blocker or important findings remain after validation.

## 🔵 Suggestions

### R1 — Container migration fallback is intentionally minimal
Evidence: `apps/crawler/src/scripts/production.ts:345-351` checks for the `comics` table and skips direct SQL replay when it exists.

Impact: This is adequate for the current single initial migration and smoke-test container path, but if future migration files are added, the direct `bun:sqlite` fallback will need a real migration ledger or should be disabled in favor of Drizzle once Bun/native support is available.

Recommendation: Track as a future hardening note; no NEW-4 code change required because `packages/db/**` migration changes are explicitly out of scope and local/systemd defaults still use existing Drizzle migration.

## Quality Review
- Dockerfile uses a fixed Bun tag, frozen lockfile install, non-root user, and runtime-only browser dependencies. Build toolchain is in the builder stage, not runner.
- Compose services map to existing package scripts and keep MCP data read-only.
- Backup sidecar copies SQLite, WAL, and SHM files and exits without daemon behavior.
- Production runner smoke envs are explicitly gated and default to disabled.
- No forbidden crawler core, site, storage, DB schema, or MCP tool-registration files were changed.

## Security Review
- No secrets or `.env` contents were added.
- No command execution uses untrusted input; compose/systemd commands are static deployment entrypoints.
- MCP exposes the existing `/health` and `/mcp` routes only; tool registration remains unchanged.
- Container runs as UID 1000.

## Dependency Review
- `bun.lock` and manifests are unchanged.
- No new package dependency was introduced.
- Docker image adds OS packages required for browser runtime only.

## Impact
- Operational deployment surface is added without altering crawler business behavior.
- Container smoke mode produces stub summary records only when `PRODUCTION_CRAWLER_SKIP_NETWORK=true`.
- Default production path still runs real site scripts.

## Precedents
- Prior crawler plan/review artifacts indicate the production runner is the intended boundary to wrap for NEW-4.

## Verification Cross-check
Validation artifact: `.rpiv/artifacts/validation/2026-07-02_18-11-48_new4-deploy-container-systemd.md`

Relevant passed checks:
- `docker build -t comics-crawler:dev .`
- compose crawler smoke with summary JSON
- MCP `/health`
- systemd static verify
- `docker run --rm comics-crawler:dev bun run --filter @comics/crawler typecheck`
- `bun run check`

## Review Result
`blockers_count: 0`
