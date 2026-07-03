---
date: 2026-07-02T18:11:48+0800
author: unknown
commit: 3e8a59b
branch: fix/new4-deploy
repository: clawling-hermes-comics
topic: "NEW-4 deployable crawler container and systemd packaging"
tags: [research, deploy, container, systemd, mcp, crawler]
status: ready
last_updated: 2026-07-02T18:11:48+0800
last_updated_by: unknown
---

# Research: NEW-4 deployable crawler container and systemd packaging

## Research Question
How should the existing Bun workspace package the crawler and MCP HTTP server into deployable container and systemd shapes without touching crawler business logic, MCP tool registration, or DB schema/migrations?

## Summary
The workspace already exposes package-local entrypoints for crawler production runs and MCP HTTP serving. Root scripts delegate to workspace filters (`package.json:10-17`), while `@comics/crawler` owns `production:probe` and `production:run` (`apps/crawler/package.json:15-16`) and `@comics/mcp-server` owns `start` (`apps/mcp-server/package.json:7`). The production runner already handles migration, browser initialization, backup, stale run cleanup, per-site execution, summary writing, artifact cleanup, and webhook alerting (`apps/crawler/src/scripts/production.ts:373-391`, `apps/crawler/src/scripts/production.ts:393-404`, `apps/crawler/src/scripts/production.ts:408-440`, `apps/crawler/src/scripts/production.ts:891-904`). The MCP layer already has env-driven host/port parsing and `/health` (`apps/mcp-server/src/env.ts:39-46`, `apps/mcp-server/src/index.ts:24-41`), so deployment should package those surfaces instead of modifying MCP registration in `server.ts`.

## Detailed Findings

### Workspace and Entrypoints
- Root scripts are workspace delegates: `crawler`, `mcp`, `db:migrate`, and `browser:install` all use Bun workspace filtering (`package.json:10-17`). Container commands should invoke `bun run --filter @comics/crawler production:run` or `bun run --filter @comics/mcp-server start` rather than inventing new root scripts.
- Crawler package exposes production and probe scripts directly (`apps/crawler/package.json:15-16`). Compose can override the Dockerfile command with those script names.
- MCP package exposes `start` as `bun run src/index.ts` (`apps/mcp-server/package.json:7`), and it already reads env through `getMcpHttpEnv` (`apps/mcp-server/src/index.ts:8`).

### Production Runner Behavior
- `runMigrations` shells out to `@comics/db db:migrate` by default (`apps/crawler/src/scripts/production.ts:373-391`), and `packages/db/package.json:19` runs Drizzle from repo root after creating the DB directory. This remains correct for local/systemd use.
- Browser initialization is already a separate `browser:install` script invoking CloakBrowser ensureBinary (`apps/crawler/package.json:9`), and the test helper's `waitForBrowser` calls the same script (`apps/crawler/src/__tests__/setup.ts:175-182`). Dockerfile only needs an equivalent wrapper, not a test-file dependency.
- The runner writes `last-production-summary.json` through `writeSummary` using `PRODUCTION_CRAWLER_SUMMARY_PATH` or `./data/last-production-summary.json` (`apps/crawler/src/scripts/production.ts:891-904`). Acceptance can verify this file from the `comics-data` volume.
- Existing tests already validate stable production summary shape (`apps/crawler/src/__tests__/crawler-real.test.ts:212-256`), so the container smoke path should preserve the same schema.

### Container Runtime Constraints
- The issue requires a Bun base with a specific tag rather than `latest`, non-root user, and CloakBrowser OS libraries. `oven/bun:1.3.14` matches the repo's `.mise.toml` Bun pin (`.mise.toml:2`) and satisfies reproducibility.
- Bun cannot execute Drizzle's `better-sqlite3` native path inside the container runtime during `db:migrate`; validation surfaced `Please install either 'better-sqlite3' or '@libsql/client'`. A container-only direct `bun:sqlite` migration path is needed for the current initial SQL while leaving default local/systemd `db:migrate` untouched.
- Bun's isolated workspace symlinks point package-local `node_modules` entries back into `.bun` paths. Hoisted install in the image and removal of stale workspace package `node_modules` symlinks make runtime imports resolve from root `node_modules` consistently for both crawler and MCP.

### MCP Boundary
- `getMcpHttpEnv` already supports `MCP_HOST`, `MCP_PORT`, `MCP_ALLOWED_HOSTS`, server name, and version (`apps/mcp-server/src/env.ts:39-46`). The deployment work should only set container env and expose ports.
- `/health` returns JSON with `ok`, name, version, transport, and schema (`apps/mcp-server/src/index.ts:24-31`). Compose healthcheck can use this endpoint directly.
- `apps/mcp-server/src/server.ts` registers tools and calls `getDbEnv`; it is out of scope by issue contract and does not need changes.

## Code References
- `package.json:10-17` — root scripts delegate to package filters.
- `apps/crawler/package.json:9` — CloakBrowser ensureBinary script.
- `apps/crawler/package.json:15-16` — production probe/run scripts.
- `packages/db/package.json:19` — Drizzle migration command used outside the container fallback.
- `apps/crawler/src/scripts/production.ts:373-391` — migration dispatch and container migration gate.
- `apps/crawler/src/scripts/production.ts:408-440` — existing SQLite backup logic.
- `apps/crawler/src/scripts/production.ts:668-697` — container smoke-test skip-network run records.
- `apps/crawler/src/scripts/production.ts:891-904` — summary path resolution and JSON write.
- `apps/mcp-server/src/env.ts:39-46` — MCP env parsing.
- `apps/mcp-server/src/index.ts:24-41` — health endpoint and Bun listener.

## Integration Points

### Inbound References
- Operator/container entrypoints call root `ENTRYPOINT ["bun", "run"]` plus compose commands targeting package scripts.
- systemd calls `/usr/local/bin/bun run --filter @comics/crawler production:run` from `/opt/comics-crawler`.
- Health probes call `GET /health` on the MCP Bun server.

### Outbound Dependencies
- Production runner shells out to `@comics/db db:migrate` unless container fallback env is enabled.
- Production runner shells out to `@comics/crawler browser:install` unless skipped for smoke tests.
- Production runner accesses SQLite via `@comics/db` client and, for container migration only, `bun:sqlite`.
- MCP server depends on `@modelcontextprotocol/hono`, `@modelcontextprotocol/server`, and `hono` from root hoisted dependencies.

### Infrastructure Wiring
- Dockerfile owns image build/runtime layout, OS dependencies, non-root user, and Bun entrypoint.
- `docker-compose.yml` owns `crawler`, `mcp-server`, and `backup` services plus named volumes.
- `deploy/systemd/comics-crawler.service` and `.timer` own one-shot local scheduling.
- `deploy/README.md` owns operational runbook.

## Architecture Insights
- Keep deployment concerns at boundary files; avoid changing crawler core (`crawler.ts`, `storage.ts`, `sites/**`) or MCP tool registration (`server.ts`).
- Prefer env-gated smoke-test behavior in `production.ts` over fake site implementations so the production runner shape remains exercised.
- Use the existing production summary schema as the container smoke contract.
- Keep systemd shell-agnostic: no fish-specific PATH tricks; use `EnvironmentFile`.

## Precedents & Lessons
1 similar prior codebase area reviewed.

### Precedent: NEW-3 production runner and crawler hardening
**Commit(s)**: current base `3e8a59b` includes production runner/test surfaces from prior work.
**Blast radius**: crawler scripts, DB package, MCP HTTP boundary.
**Follow-up fixes**: none identified in this run.
**Lessons from docs**:
- `.rpiv/artifacts/reviews/2026-06-29_23-15-17_entire-crawler.md` — crawler review artifacts exist and are part of historical context.
- `.rpiv/artifacts/plans/2026-06-28_10-57-12_rouman5-comic-catalog-crawler.md` — prior phased crawler plan informs package-local scripts and production runner usage.

**Takeaway**: Deployment should wrap the stabilized production runner instead of reworking crawler internals.

### Composite Lessons
- Keep direct DB/schema edits out of NEW-4; migration support must reuse existing SQL/migration files.
- The MCP boundary already has env and health support, so deployment should not touch tool registration.

## Historical Context (from `.rpiv/artifacts/`)
- `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md` — initial workspace research.
- `.rpiv/artifacts/plans/2026-06-26_20-13-59_mise-bun-crawler-mcp-drizzle-biome-skeleton.md` — initial workspace implementation plan.
- `.rpiv/artifacts/plans/2026-06-28_10-57-12_rouman5-comic-catalog-crawler.md` — crawler implementation plan.
- `.rpiv/artifacts/reviews/2026-06-29_23-15-17_entire-crawler.md` — prior crawler review.

## Developer Context
**Q (issue): Should NEW-4 follow `/wf build` rather than ship/arch?**
A: Yes. PM comment pinned `/wf build`: research → blueprint → implement → validate → code-review → revise loop → commit.

**Q (issue): Should this task push or open a PR?**
A: No PR required; do not push main/master. WIP local commits are allowed for auditable SHAs.

## Related Research
- None newly linked beyond historical context above.

## Open Questions
None.
