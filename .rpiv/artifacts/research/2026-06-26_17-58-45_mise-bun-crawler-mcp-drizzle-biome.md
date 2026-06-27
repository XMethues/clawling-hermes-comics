---
date: 2026-06-26T17:58:45+0800
author: unknown
commit: no-commit
branch: no-branch
repository: unknown
topic: "使用mise创建bun workspace的两个项目的骨架 1. crawlee + playwrite的爬虫项目，结果要存入数据库使用drizzle orm 2 mcp server同时使用drizzle orm读取爬虫的储存"
tags: [research, codebase, mise, bun, crawlee, playwright, drizzle, mcp, biome]
status: ready
last_updated: 2026-06-26T17:58:45+0800
last_updated_by: unknown
---

# Research: 使用mise创建bun workspace的两个项目的骨架 1. crawlee + playwrite的爬虫项目，结果要存入数据库使用drizzle orm 2 mcp server同时使用drizzle orm读取爬虫的储存

## Research Question

How should an empty directory be structured as a mise-managed Bun workspace containing two apps — a Crawlee + Playwright crawler that stores results through Drizzle ORM, and an MCP server that reads that same storage through Drizzle ORM — with Biome added as the workspace quality tool?

## Summary

The current directory has no existing application source; this is a greenfield skeleton request recorded in `.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl:1`. The recommended architecture is a root-managed Bun workspace with `apps/crawler`, `apps/mcp-server`, and `packages/db`, with `.mise.toml` delegating all developer commands to root Bun scripts. The shared `packages/db` package is the load-bearing contract: crawler writes and MCP reads must import the same Drizzle schema/client/env code instead of duplicating table names or connection setup. The developer selected local SQLite as the default database, so the skeleton should use `drizzle-orm/bun-sqlite`, `DB_FILE_NAME`, and generated migrations under the shared DB package. Biome should be installed once at the root with one root `biome.json`; workspace packages do not need duplicate Biome scripts unless they later require package-specific behavior.

## Detailed Findings

### Existing Repository State

- No `package.json`, `.mise.toml`, `tsconfig.json`, `apps/`, `packages/`, or source files are present in the working directory.
- The current concrete requirement is recorded at `.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl:1`.
- An earlier similar request exists at `.rpiv/workflows/runs/2026-06-26_17-56-54-b97c.jsonl:1`, but its research run was aborted at `.rpiv/workflows/runs/2026-06-26_17-56-54-b97c.jsonl:2`; it should not be treated as an approved design.
- Because the target files do not exist yet, downstream design should treat all app/package paths as target artifacts, not verified existing implementation.

### Root Bootstrap: mise + Bun Workspace

- `.mise.toml` should be the root tool/task entry point. It should declare the Bun toolchain and expose stable tasks such as setup, install, browser install, DB generate/migrate, crawler, MCP, typecheck, check, fix, and ci.
- Root `package.json` should be private and own Bun workspaces for `apps/crawler`, `apps/mcp-server`, and `packages/*`.
- Root scripts should be the single command graph that `.mise.toml` delegates to. This avoids `.mise.toml` and `package.json` becoming two independent task surfaces.
- `tsconfig.base.json` should centralize TypeScript settings for Bun/ESNext/strict mode; each workspace should extend it from its local `tsconfig.json`.
- Bun workspace dependencies should use `workspace:*`, especially `@comics/db` from both apps.

### Shared Database Contract: `packages/db`

- `packages/db/src/schema.ts` should be the single schema source of truth and export tables such as `crawlRuns` and `crawlItems`.
- `packages/db/src/client.ts` should be the only place that initializes the Drizzle client and imports the schema. App code should not know the driver details.
- `packages/db/src/env.ts` should validate `DB_FILE_NAME` and fail fast when it is missing or empty.
- Root `drizzle.config.ts` should point to `./packages/db/src/schema.ts` and output migrations under `./packages/db/drizzle` so runtime schema and migrations cannot drift.
- The selected SQLite path means `DB_FILE_NAME` is the shared database locator; use an absolute or root-relative default from mise to avoid path drift when commands run from different workspaces.

### Crawler App Boundary: `apps/crawler`

- `apps/crawler/package.json` should own `crawlee` and `playwright`; these dependencies should not be placed in the MCP app.
- `apps/crawler/src/index.ts` should remain an orchestration entry: read crawler env, create a crawl run, construct the crawler, run it, and finalize run status.
- `apps/crawler/src/crawler.ts` should own Crawlee-specific lifecycle details: `RequestQueue`, router creation, `PlaywrightCrawler`, request handlers, and failed-request handling.
- `apps/crawler/src/types.ts` should define a plain `CrawlResult` DTO so persistence code is not coupled to Crawlee/Playwright types.
- `apps/crawler/src/storage.ts` should convert `CrawlResult` into Drizzle writes against `crawlRuns` and `crawlItems`; Crawlee Dataset can remain incidental runtime storage, not the business source of truth.
- Persisted item identity should include at least run id, Crawlee request unique key, source URL, loaded URL, title/content snapshot, HTTP status, status, timestamps, retry/error fields, and optionally a content hash.

### MCP Server Boundary: `apps/mcp-server`

- `apps/mcp-server/package.json` should own `@modelcontextprotocol/sdk` and `zod`, plus `@comics/db` via `workspace:*`.
- `apps/mcp-server/src/index.ts` should connect the server to `StdioServerTransport` for the default skeleton.
- `apps/mcp-server/src/server.ts` should construct `McpServer`, register tools before connecting transport, and keep server metadata centralized.
- `apps/mcp-server/src/tools/list-crawled-items.ts` should define MCP input schemas and read persisted rows through `@comics/db` only.
- The MCP app should not import Crawlee or Playwright. Its boundary is Drizzle reads over the same SQLite file that the crawler writes.
- For stdio MCP, logs must go to stderr; stdout is reserved for JSON-RPC protocol messages.

### Environment and Command Surface

- `.env.example` should distinguish shared DB env from app env: `DB_FILE_NAME`, crawler start URLs/limits, Crawlee runtime storage/headless/log settings, and MCP server name/version/transport settings.
- Missing `DB_FILE_NAME` should fail during DB client initialization and during Drizzle Kit config loading.
- Missing crawler start URLs should fail in the crawler entry before constructing `PlaywrightCrawler`.
- The primary developer flow should be `mise run setup`, then `mise run crawler` and `mise run mcp`.
- Migration commands should be exposed from root scripts and delegated to `packages/db`/Drizzle Kit so both apps remain consumers of the shared DB package.

### Biome Quality Layer

- Biome should be a root-level quality tool: one root `@biomejs/biome` dev dependency and one root `biome.json` or `biome.jsonc`.
- Root `package.json` should expose non-mutating check, mutating fix/format, and CI scripts; `.mise.toml` should delegate quality tasks to those scripts.
- `apps/crawler`, `apps/mcp-server`, and `packages/db` do not need local Biome scripts for the initial skeleton.
- Biome can cover TypeScript/JavaScript/JSON files across `apps/*` and `packages/*`; it does not cover TOML or SQL migrations, so `.mise.toml` and generated SQL should not be assumed to be Biome-managed.
- If nested configs are introduced later, they should be explicit package-level overrides rather than the default monorepo pattern.

## Code References

- `.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl:1` — Current request: mise + Bun workspace, Crawlee/Playwright crawler, Drizzle persistence, MCP server reading stored crawler data.
- `.rpiv/workflows/runs/2026-06-26_17-56-54-b97c.jsonl:1` — Earlier related skeleton request without the explicit Drizzle/MCP-read-storage detail.
- `.rpiv/workflows/runs/2026-06-26_17-56-54-b97c.jsonl:2` — Earlier research stage was aborted; no implementation or plan should be inferred from it.

## Integration Points

### Inbound References

- `.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl:1` — User request is the only inbound driver for the skeleton.
- Target `root package.json` scripts — Developer-facing commands should route to app/package scripts.
- Target `.mise.toml` tasks — Stable command aliases should wrap root Bun scripts.
- Target MCP client configuration — External MCP clients will launch the Bun process and communicate over stdio.

### Outbound Dependencies

- Target `apps/crawler/package.json` — Depends on `crawlee`, `playwright`, and `@comics/db`.
- Target `apps/mcp-server/package.json` — Depends on `@modelcontextprotocol/sdk`, `zod`, and `@comics/db`.
- Target `packages/db/package.json` — Depends on `drizzle-orm`; owns `drizzle-kit` for migrations.
- Target root `package.json` — Owns `typescript`, `@types/bun`, and `@biomejs/biome` as workspace-level dev dependencies.

### Infrastructure Wiring

- Target `.mise.toml` — Declares Bun and delegates install/setup/run/check tasks.
- Target `drizzle.config.ts` — Reads shared DB env and points Drizzle Kit at `packages/db/src/schema.ts`.
- Target `.env.example` — Documents `DB_FILE_NAME`, crawler runtime settings, Crawlee settings, and MCP settings.
- Target `biome.json` — Defines workspace-level format/lint/import-organize policy.
- Target `tsconfig.base.json` — Defines shared TypeScript compiler behavior for all workspace packages.

## Architecture Insights

- The database package is the central architectural seam. Crawler and MCP should share `@comics/db`, not direct SQL strings or duplicated table definitions.
- SQLite is the correct default for this skeleton because the developer selected it and it keeps mise setup local, reproducible, and free of external service bootstrapping.
- Crawlee/Playwright dependencies belong only to `apps/crawler`; the MCP app should be storage-oriented and browser-free.
- MCP tool schemas and Drizzle SQL schemas are different contracts. Tool schemas validate client arguments; Drizzle schemas define persisted rows.
- Stdio MCP transport makes stdout a protocol channel. Any debug logging in the MCP server must use stderr.
- Root command delegation should be one-way: mise tasks call root Bun scripts; root scripts route to workspaces. Avoid duplicating command semantics in every layer.
- Biome belongs at the root for an initial monorepo. Nested configs and workspace-local quality scripts should be deferred until there is a proven package-specific need.

## External References

- Bun workspaces — https://bun.sh/docs/pm/workspaces
- Bun run/scripts — https://bun.sh/docs/cli/run
- Bun environment variables — https://bun.sh/docs/runtime/env
- mise Bun tool — https://mise.jdx.dev/lang/bun.html
- mise configuration — https://mise.jdx.dev/configuration.html
- mise tasks — https://mise.jdx.dev/tasks/
- Crawlee quick start — https://crawlee.dev/js/docs/quick-start
- Crawlee PlaywrightCrawler — https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler
- Crawlee RequestQueue — https://crawlee.dev/js/api/core/class/RequestQueue
- Crawlee Request — https://crawlee.dev/js/api/core/class/Request
- Playwright Page API — https://playwright.dev/docs/api/class-page
- Drizzle Bun SQLite — https://orm.drizzle.team/docs/get-started/bun-sqlite-new
- Drizzle schema declaration — https://orm.drizzle.team/docs/sql-schema-declaration
- Drizzle insert/upsert — https://orm.drizzle.team/docs/insert
- Drizzle config — https://orm.drizzle.team/docs/drizzle-config-file
- Drizzle migrations — https://orm.drizzle.team/docs/migrations
- MCP build server guide — https://modelcontextprotocol.io/docs/develop/build-server
- MCP transports — https://modelcontextprotocol.io/specification/latest/basic/transports
- MCP tools — https://modelcontextprotocol.io/specification/latest/server/tools
- Biome getting started — https://biomejs.dev/guides/getting-started/
- Biome configuration — https://biomejs.dev/guides/configure-biome/
- Biome monorepo/big projects — https://biomejs.dev/guides/big-projects/
- Biome CLI — https://biomejs.dev/reference/cli/

## Precedents & Lessons

0 similar past changes analyzed.

### Precedent: unavailable

**Commit(s)**: unavailable — metadata reports `no-commit`.

**Blast radius**: Not applicable; there is no git history available for this workspace.

**Follow-up fixes**:
- None found; git history unavailable.

**Lessons from docs**:
- No `.rpiv/artifacts/` documents were found for prior plans/designs/research.

**Takeaway**: Treat this as a greenfield skeleton and verify each generated command during implementation rather than relying on repository precedent.

### Composite Lessons

- Keep shared schema/client/env in `packages/db` so crawler writes and MCP reads cannot drift.
- Keep browser automation dependencies out of MCP server; the persistent SQLite database is the integration boundary.
- Keep quality tooling at the root first; Biome workspace-local duplication is unnecessary for the initial skeleton.
- Verify Crawlee + Playwright under Bun during implementation, because third-party examples often assume Node/npm even when Bun can run TypeScript.

## Historical Context (from `.rpiv/artifacts/`)

None found.

## Developer Context

**Q (`.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl:1`): The request requires Drizzle ORM storage but does not specify a database dialect. Which database should the skeleton default to?**
A: SQLite local file.

**Q (`.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl:1`): The scan covered mise, Bun, Crawlee/Playwright, Drizzle, and MCP. Is there another required workspace-level concern to include before writing?**
A: 还有biome. Biome should be included as a root-level lint/format/check quality layer.

## Related Research

None.

## Open Questions

None blocking. Implementation should still verify generated commands, Drizzle migrations, Playwright browser installation, and MCP stdio startup in the created workspace.
