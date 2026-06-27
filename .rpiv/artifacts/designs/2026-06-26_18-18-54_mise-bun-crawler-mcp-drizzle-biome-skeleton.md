---
date: 2026-06-26T18:18:54+0800
author: unknown
commit: no-commit
branch: no-branch
repository: unknown
topic: "mise-managed Bun workspace skeleton with Crawlee, Drizzle DB skeleton, Hono MCP HTTP API, and Biome"
tags: [design, mise, bun, crawlee, playwright, drizzle, mcp, hono, biome]
status: ready
parent: .rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md
last_updated: 2026-06-26T18:18:54+0800
last_updated_by: unknown
---

# Design: mise-managed Bun workspace skeleton

## Summary

Build a greenfield mise-managed Bun workspace with a crawler app, an MCP HTTP API app, a shared Drizzle DB skeleton package, and root Biome quality tooling. The design follows the root command graph and shared DB seam from research, but incorporates developer decisions to defer actual database tables/read-write logic and to use Hono + Bun with MCP SDK v2 for remote MCP access.

## Requirements

- Create a private Bun workspace with `apps/crawler`, `apps/mcp-server`, and `packages/db`.
- Use `.mise.toml` as the stable developer task entry point while delegating command semantics to root Bun scripts.
- Add root-level Biome formatting/lint/check tooling.
- Add a shared `@comics/db` package that validates `DB_FILE_NAME` and initializes Drizzle over Bun SQLite.
- Defer concrete Drizzle tables, migrations with real table DDL, crawler persistence writes, and MCP data query tools until content schema is known.
- Add a Crawlee + Playwright crawler skeleton that validates start URLs and returns generic crawl results.
- Add a remote MCP HTTP API service using Hono + Bun + MCP SDK v2, not local stdio.
- Keep Crawlee/Playwright dependencies out of the MCP server package.

## Current State Analysis

The repository is currently greenfield application-wise. Research found no root `package.json`, `.mise.toml`, `tsconfig.json`, `apps/`, `packages/`, or source files in the working directory, so every target source/config file in this design is new.

### Key Discoveries

- Greenfield state: `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:28` reports no existing app/config source files.
- Root command graph: `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:35-37` recommends `.mise.toml` delegating to root Bun scripts.
- Workspace shape: `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:36` names `apps/crawler`, `apps/mcp-server`, and `packages/*`.
- Shared DB seam: `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:43-45` names schema/client/env as DB package responsibilities.
- SQLite choice: `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:181` records the developer-selected SQLite local file.
- Crawler boundary: `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:51-55` separates crawler orchestration, Crawlee lifecycle, DTOs, and storage.
- MCP boundary changed: research defaulted stdio at `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:61-65`, but developer selected remote Hono+Bun MCP SDK v2.
- Biome root-only: `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:77-80` recommends one root Biome config and no package-local Biome scripts initially.

## Scope

### Building

- Root Bun workspace files and scripts.
- mise task aliases for setup/install/browser install/db generate/db migrate/crawler/MCP/typecheck/check/fix/ci.
- Root TypeScript config and package-level TypeScript configs.
- Root Biome config.
- Shared `@comics/db` package with env validation, empty schema module, Drizzle Bun SQLite client, and migration scripts.
- Crawlee + Playwright crawler app skeleton that can crawl configured URLs and produce in-memory generic result DTOs.
- Hono + Bun MCP HTTP API skeleton using MCP SDK v2 with `/mcp`, `/health`, and a `storage_status` tool.

### Not Building

- `crawl_runs`, `crawl_items`, or any other concrete Drizzle tables.
- Generated SQL migrations containing table DDL.
- Crawler persistence writes into Drizzle tables.
- MCP tools that list/query crawled items.
- Domain-specific content tables such as comics, chapters, pages, images, authors, tags, or sources.
- Local stdio MCP entrypoint.
- Package-local Biome configs or package-local Biome scripts.

## Decisions

### Shared DB package remains the integration seam

The crawler and MCP packages depend on `@comics/db`; DB connection/env/schema concerns stay in `packages/db`. This follows `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:22` and `:43-45`.

### Concrete DB tables are deferred

Ambiguity: research recommended shared tables such as `crawlRuns` and `crawlItems` at `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:43` and item identity fields at `:56`, but the developer asked to wait until content is known.

Explored:

- Option A: generic `crawl_runs`/`crawl_items` now — keeps crawler/MCP closed-loop, but risks creating content-agnostic tables that may not fit the later domain model.
- Option B: DB skeleton only — keeps schema flexible, but defers real persistence and MCP data reads.
- Option C: domain tables now — premature because content shape is not known.

Decision: DB skeleton only. Actual tables, persistence writes, and MCP data read tools are deferred by explicit developer checkpoint.

### Root command graph and root Biome

`.mise.toml` delegates to root Bun scripts, and Biome is configured once at the root. This follows `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:35-37` and `:77-80`.

### Dependency isolation

`apps/crawler` owns Crawlee/Playwright. `apps/mcp-server` stays browser-free and depends on MCP/Hono/Zod plus `@comics/db`. This follows `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:51`, `:60`, and `:117`.

### MCP is remote HTTP via Hono+Bun+SDK v2

Research defaulted MCP stdio (`.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:61-65`), but the developer clarified they want a remotely accessible API service and selected Hono+Bun using MCP SDK v2. The design therefore uses `@modelcontextprotocol/server`, `@modelcontextprotocol/hono`, Hono, and Bun HTTP serving rather than `@modelcontextprotocol/sdk` stdio.

## Architecture

### package.json — NEW

Root workspace package manifest and command graph.

```json
{
  "name": "comics",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "setup": "bun install && bun run browser:install",
    "browser:install": "bun run --filter @comics/crawler browser:install",
    "db:generate": "bun run --filter @comics/db db:generate",
    "db:migrate": "bun run --filter @comics/db db:migrate",
    "crawler": "bun run --filter @comics/crawler start",
    "mcp": "bun run --filter @comics/mcp-server start",
    "typecheck": "bunx tsc --noEmit -p tsconfig.json",
    "check": "biome check . && bun run typecheck",
    "fix": "biome check --write .",
    "ci": "bun run check"
  },
  "devDependencies": {
    "@biomejs/biome": "latest",
    "@types/bun": "latest",
    "typescript": "latest"
  }
}
```

### .mise.toml — NEW

mise tool pin and task aliases that delegate to root Bun scripts.

```toml
[tools]
bun = "latest"

[env]
_.file = ".env"
DB_FILE_NAME = "{{config_root}}/data/comics.sqlite"
CRAWLEE_STORAGE_DIR = "{{config_root}}/storage/crawler"
MCP_HOST = "0.0.0.0"
MCP_PORT = "3000"

[tasks.setup]
description = "Install dependencies and Playwright browsers"
run = "bun run setup"

[tasks.install]
description = "Install Bun workspace dependencies"
run = "bun install"

[tasks."browser:install"]
description = "Install Playwright browser binaries for the crawler"
run = "bun run browser:install"

[tasks."db:generate"]
description = "Generate Drizzle migrations from the shared DB schema"
run = "bun run db:generate"

[tasks."db:migrate"]
description = "Apply Drizzle migrations to DB_FILE_NAME"
run = "bun run db:migrate"

[tasks.crawler]
description = "Run the Crawlee + Playwright crawler"
run = "bun run crawler"

[tasks.mcp]
description = "Run the Hono + Bun MCP HTTP API service"
run = "bun run mcp"

[tasks.typecheck]
description = "Typecheck all workspace TypeScript"
run = "bun run typecheck"

[tasks.check]
description = "Run Biome checks and TypeScript typecheck"
run = "bun run check"

[tasks.fix]
description = "Apply Biome safe fixes and formatting"
run = "bun run fix"

[tasks.ci]
description = "Run the non-mutating CI quality gate"
run = "bun run ci"
```

### tsconfig.base.json — NEW

Shared strict TypeScript compiler settings for Bun/ESNext packages.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["bun"]
  }
}
```

### tsconfig.json — NEW

Root TypeScript project that typechecks apps, packages, and Drizzle config.

```json
{
  "extends": "./tsconfig.base.json",
  "include": ["apps/**/*.ts", "packages/**/*.ts", "drizzle.config.ts"],
  "exclude": [
    "node_modules",
    "dist",
    "apps/**/dist",
    "packages/**/dist",
    "packages/db/drizzle",
    "storage",
    "data"
  ]
}
```

### biome.json — NEW

Root Biome formatter/linter/import organizer configuration.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": {
    "enabled": false,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": [
      "**",
      "!node_modules",
      "!dist",
      "!apps/**/dist",
      "!packages/**/dist",
      "!packages/db/drizzle",
      "!storage",
      "!data"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "organizeImports": {
    "enabled": true
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always"
    }
  }
}
```

### .env.example — NEW

Documented shared DB, crawler, and MCP HTTP service environment variables.

```dotenv
# Shared SQLite database file. mise defaults this to an absolute project-local path.
DB_FILE_NAME=./data/comics.sqlite

# Crawlee/Playwright crawler skeleton.
CRAWLER_START_URLS=https://example.com
CRAWLER_MAX_REQUESTS=10
CRAWLER_HEADLESS=true
CRAWLER_CAPTURE_HTML=false
CRAWLEE_STORAGE_DIR=./storage/crawler

# Hono + Bun MCP HTTP API skeleton.
MCP_SERVER_NAME=comics-mcp-server
MCP_SERVER_VERSION=0.1.0
MCP_HOST=0.0.0.0
MCP_PORT=3000
# Comma-separated hostnames allowed by MCP host-header validation. Leave empty to disable.
MCP_ALLOWED_HOSTS=localhost,127.0.0.1
```

### drizzle.config.ts — NEW

Root Drizzle Kit config pointing at the DB package schema and migrations output.

```ts
import { defineConfig } from "drizzle-kit";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Set it in .env or via mise env.`);
  }

  return value;
}

export default defineConfig({
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: requiredEnv("DB_FILE_NAME"),
  },
  strict: true,
  verbose: true,
});
```

### packages/db/package.json — NEW

Shared DB package manifest and migration scripts.

```json
{
  "name": "@comics/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./schema": {
      "types": "./src/schema.ts",
      "default": "./src/schema.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "db:generate": "drizzle-kit generate --config ../../drizzle.config.ts",
    "db:migrate": "drizzle-kit migrate --config ../../drizzle.config.ts"
  },
  "dependencies": {
    "drizzle-orm": "latest"
  },
  "devDependencies": {
    "drizzle-kit": "latest"
  }
}
```

### packages/db/tsconfig.json — NEW

DB package TypeScript config.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

### packages/db/src/env.ts — NEW

DB environment validation.

```ts
export interface DbEnv {
  fileName: string;
}

export type EnvSource = Record<string, string | undefined>;

export function getDbEnv(source: EnvSource = process.env): DbEnv {
  const fileName = source.DB_FILE_NAME?.trim();

  if (!fileName) {
    throw new Error("DB_FILE_NAME is required. Set it in .env or through mise env.");
  }

  return { fileName };
}
```

### packages/db/src/schema.ts — NEW

Intentionally empty initial Drizzle schema module.

```ts
/**
 * Initial schema is intentionally empty.
 *
 * The first content-modeling pass will add crawl/domain tables here once the
 * crawler result shape is known. Keeping this module present now lets Drizzle
 * Kit, the crawler app, and the MCP API share one stable package boundary.
 */
export const schema = {};

export type DbSchema = typeof schema;
```

### packages/db/src/client.ts — NEW

Bun SQLite + Drizzle client factory.

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { getDbEnv } from "./env";
import { schema } from "./schema";

export interface CreateDbOptions {
  fileName?: string;
  sqlite?: Database;
}

export function createSqliteDatabase(fileName = getDbEnv().fileName): Database {
  return new Database(fileName, { create: true });
}

export function createDb(options: CreateDbOptions = {}) {
  const sqlite = options.sqlite ?? createSqliteDatabase(options.fileName);

  return drizzle(sqlite, { schema });
}

export type ComicsDb = ReturnType<typeof createDb>;

export function closeSqliteDatabase(sqlite: Database): void {
  sqlite.close();
}
```

### packages/db/src/index.ts — NEW

DB package public exports.

```ts
export type { DbEnv, EnvSource } from "./env";
export { getDbEnv } from "./env";
export type { CreateDbOptions, ComicsDb } from "./client";
export { closeSqliteDatabase, createDb, createSqliteDatabase } from "./client";
export type { DbSchema } from "./schema";
export { schema } from "./schema";
```

### apps/crawler/package.json — NEW

Crawler package manifest.

```json
{
  "name": "@comics/crawler",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "dev": "bun run src/index.ts",
    "browser:install": "playwright install chromium",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@comics/db": "workspace:*",
    "crawlee": "latest",
    "playwright": "latest"
  }
}
```

### apps/crawler/tsconfig.json — NEW

Crawler package TypeScript config.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

### apps/crawler/src/env.ts — NEW

Crawler environment parsing and validation.

```ts
export interface CrawlerEnv {
  startUrls: string[];
  maxRequests: number;
  headless: boolean;
  captureHtml: boolean;
  storageDir?: string;
}

export type EnvSource = Record<string, string | undefined>;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parsePositiveInteger(value: string | undefined, name: string, defaultValue: number): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseStartUrls(value: string | undefined): string[] {
  const urls = value
    ?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (!urls?.length) {
    throw new Error("CRAWLER_START_URLS is required. Provide one or more comma-separated URLs.");
  }

  for (const url of urls) {
    new URL(url);
  }

  return urls;
}

export function getCrawlerEnv(source: EnvSource = process.env): CrawlerEnv {
  return {
    startUrls: parseStartUrls(source.CRAWLER_START_URLS),
    maxRequests: parsePositiveInteger(source.CRAWLER_MAX_REQUESTS, "CRAWLER_MAX_REQUESTS", 10),
    headless: parseBoolean(source.CRAWLER_HEADLESS, true),
    captureHtml: parseBoolean(source.CRAWLER_CAPTURE_HTML, false),
    storageDir: source.CRAWLEE_STORAGE_DIR?.trim() || undefined,
  };
}
```

### apps/crawler/src/types.ts — NEW

Generic crawler result DTOs.

```ts
export type CrawlResultStatus = "succeeded" | "failed";

export interface CrawlerConfig {
  startUrls: string[];
  maxRequestsPerCrawl: number;
  headless: boolean;
  captureHtml: boolean;
  storageDir?: string;
}

export interface CrawlResult {
  requestUniqueKey: string;
  sourceUrl: string;
  loadedUrl?: string;
  title?: string;
  textContent?: string;
  htmlContent?: string;
  status: CrawlResultStatus;
  retryCount: number;
  errorMessage?: string;
  crawledAt: string;
}

export interface CrawlSummary {
  total: number;
  succeeded: number;
  failed: number;
  results: CrawlResult[];
}
```

### apps/crawler/src/crawler.ts — NEW

Crawlee + Playwright crawl lifecycle.

```ts
import { createPlaywrightRouter, PlaywrightCrawler, RequestQueue } from "crawlee";

import type { CrawlerConfig, CrawlResult, CrawlSummary } from "./types";

function summarize(results: CrawlResult[]): CrawlSummary {
  const succeeded = results.filter((result) => result.status === "succeeded").length;
  const failed = results.filter((result) => result.status === "failed").length;

  return {
    total: results.length,
    succeeded,
    failed,
    results,
  };
}

export async function runCrawler(config: CrawlerConfig): Promise<CrawlSummary> {
  if (config.storageDir) {
    process.env.CRAWLEE_STORAGE_DIR = config.storageDir;
  }

  const results: CrawlResult[] = [];
  const requestQueue = await RequestQueue.open();

  await requestQueue.addRequests(config.startUrls.map((url) => ({ url })));

  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, log }) => {
    const title = await page.title();
    const textContent = await page.locator("body").innerText().catch(() => "");
    const htmlContent = config.captureHtml ? await page.content() : undefined;

    results.push({
      requestUniqueKey: request.uniqueKey,
      sourceUrl: request.url,
      loadedUrl: request.loadedUrl,
      title,
      textContent,
      htmlContent,
      status: "succeeded",
      retryCount: request.retryCount,
      crawledAt: new Date().toISOString(),
    });

    log.info(`Crawled ${request.loadedUrl ?? request.url}`);
  });

  const crawler = new PlaywrightCrawler({
    requestQueue,
    requestHandler: router,
    maxRequestsPerCrawl: config.maxRequestsPerCrawl,
    headless: config.headless,
    failedRequestHandler: async ({ request, error, log }) => {
      results.push({
        requestUniqueKey: request.uniqueKey,
        sourceUrl: request.url,
        loadedUrl: request.loadedUrl,
        status: "failed",
        retryCount: request.retryCount,
        errorMessage: error instanceof Error ? error.message : String(error),
        crawledAt: new Date().toISOString(),
      });

      log.error(`Failed ${request.url}: ${error instanceof Error ? error.message : String(error)}`);
    },
  });

  await crawler.run();

  return summarize(results);
}
```

### apps/crawler/src/index.ts — NEW

Crawler app entrypoint.

```ts
import { getDbEnv } from "@comics/db";

import { runCrawler } from "./crawler";
import { getCrawlerEnv } from "./env";

async function main(): Promise<void> {
  const dbEnv = getDbEnv();
  const crawlerEnv = getCrawlerEnv();

  console.info(`DB file configured at ${dbEnv.fileName}. Persistence schema is deferred.`);
  console.info(`Starting crawler for ${crawlerEnv.startUrls.length} URL(s).`);

  const summary = await runCrawler({
    startUrls: crawlerEnv.startUrls,
    maxRequestsPerCrawl: crawlerEnv.maxRequests,
    headless: crawlerEnv.headless,
    captureHtml: crawlerEnv.captureHtml,
    storageDir: crawlerEnv.storageDir,
  });

  console.info(
    `Crawler finished: ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.total} total.`,
  );
}

await main().catch((error) => {
  console.error("Crawler failed:", error);
  process.exit(1);
});
```

### apps/mcp-server/package.json — NEW

MCP HTTP API package manifest.

```json
{
  "name": "@comics/mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "dev": "bun --watch src/index.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@comics/db": "workspace:*",
    "@modelcontextprotocol/hono": "latest",
    "@modelcontextprotocol/server": "latest",
    "hono": "latest",
    "zod": "latest"
  }
}
```

### apps/mcp-server/tsconfig.json — NEW

MCP package TypeScript config.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

### apps/mcp-server/src/env.ts — NEW

MCP HTTP service environment parsing and validation.

```ts
export interface McpHttpEnv {
  name: string;
  version: string;
  host: string;
  port: number;
  allowedHosts: string[];
}

export type EnvSource = Record<string, string | undefined>;

function optionalString(value: string | undefined, defaultValue: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : defaultValue;
}

function parsePort(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("MCP_PORT must be an integer between 1 and 65535.");
  }

  return parsed;
}

function parseAllowedHosts(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((host) => host.trim())
      .filter(Boolean) ?? []
  );
}

export function getMcpHttpEnv(source: EnvSource = process.env): McpHttpEnv {
  return {
    name: optionalString(source.MCP_SERVER_NAME, "comics-mcp-server"),
    version: optionalString(source.MCP_SERVER_VERSION, "0.1.0"),
    host: optionalString(source.MCP_HOST, "0.0.0.0"),
    port: parsePort(source.MCP_PORT, 3000),
    allowedHosts: parseAllowedHosts(source.MCP_ALLOWED_HOSTS),
  };
}
```

### apps/mcp-server/src/server.ts — NEW

MCP server construction and tool registration.

```ts
import { getDbEnv, schema } from "@comics/db";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";

import type { McpHttpEnv } from "./env";

export function createComicsMcpServer(env: Pick<McpHttpEnv, "name" | "version">): McpServer {
  const server = new McpServer({
    name: env.name,
    version: env.version,
  });

  server.registerTool(
    "storage_status",
    {
      description: "Report configured SQLite storage for the current skeleton.",
      inputSchema: z.object({}),
    },
    async () => {
      const dbEnv = getDbEnv();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                dbFileName: dbEnv.fileName,
                schema: "deferred",
                tables: Object.keys(schema),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}
```

### apps/mcp-server/src/index.ts — NEW

Hono + Bun HTTP entrypoint exposing MCP over `/mcp`.

```ts
import { createMcpHonoApp, hostHeaderValidation } from "@modelcontextprotocol/hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";

import { getMcpHttpEnv } from "./env";
import { createComicsMcpServer } from "./server";

const env = getMcpHttpEnv();
const mcpServer = createComicsMcpServer(env);
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

await mcpServer.connect(transport);

const app = createMcpHonoApp();

if (env.allowedHosts.length > 0) {
  app.use("*", hostHeaderValidation(env.allowedHosts));
}

app.get("/health", (context) =>
  context.json({
    ok: true,
    name: env.name,
    version: env.version,
    transport: "streamable-http",
    schema: "deferred",
  }),
);

app.all("/mcp", (context) =>
  transport.handleRequest(context.req.raw, { parsedBody: context.get("parsedBody") }),
);

const httpServer = Bun.serve({
  hostname: env.host,
  port: env.port,
  fetch: app.fetch,
});

console.info(`MCP HTTP API listening on http://${env.host}:${httpServer.port}/mcp`);

async function shutdown(signal: string): Promise<void> {
  console.info(`Received ${signal}; shutting down MCP HTTP API.`);
  await transport.close();
  await mcpServer.close();
  httpServer.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
```

## Slices

### Slice 1: Root workspace/tooling foundation

**Files**: `package.json`, `.mise.toml`, `tsconfig.base.json`, `tsconfig.json`, `biome.json`, `.env.example`, `drizzle.config.ts`

#### Automated Verification:
- [ ] Root package manifest is valid JSON: `bun -e 'JSON.parse(await Bun.file("package.json").text())'`
- [ ] TypeScript base config is valid JSON: `bun -e 'JSON.parse(await Bun.file("tsconfig.base.json").text())'`
- [ ] Root TypeScript config is valid JSON: `bun -e 'JSON.parse(await Bun.file("tsconfig.json").text())'`
- [ ] Biome config is valid JSON: `bun -e 'JSON.parse(await Bun.file("biome.json").text())'`
- [ ] Drizzle config points at the shared DB package schema: `grep -q './packages/db/src/schema.ts' drizzle.config.ts`

#### Manual Verification:
- [ ] `.mise.toml` tasks delegate to root Bun scripts instead of duplicating command logic.
- [ ] `package.json` does not define an `install` lifecycle script, avoiding recursive `bun install` behavior.
- [ ] `.env.example` documents shared DB, crawler, and MCP HTTP service variables.
- [ ] Full `mise run check` is intentionally deferred until all workspace packages exist in Slice 4.

### Slice 2: Shared DB skeleton package

**Files**: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/env.ts`, `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/index.ts`

#### Automated Verification:
- [ ] DB package manifest is valid JSON: `bun -e 'JSON.parse(await Bun.file("packages/db/package.json").text())'`
- [ ] DB package TypeScript config is valid JSON: `bun -e 'JSON.parse(await Bun.file("packages/db/tsconfig.json").text())'`
- [ ] DB env validation rejects missing `DB_FILE_NAME`: `bun -e 'import { getDbEnv } from "./packages/db/src/env.ts"; try { getDbEnv({}); process.exit(1); } catch { process.exit(0); }'`
- [ ] DB schema is intentionally empty in this scope: `grep -q 'export const schema = {}' packages/db/src/schema.ts`
- [ ] DB client uses Drizzle Bun SQLite: `grep -q 'drizzle-orm/bun-sqlite' packages/db/src/client.ts`

#### Manual Verification:
- [ ] `packages/db/src/schema.ts` contains no concrete tables, matching the developer decision to defer schema design.
- [ ] `packages/db/package.json` owns `drizzle-kit` and its migration scripts use the root `../../drizzle.config.ts`.
- [ ] `createDb` is a factory, not an eager singleton, so merely importing `@comics/db` does not open SQLite.
- [ ] Public exports keep apps dependent on `@comics/db` instead of driver-specific setup.

### Slice 3: Crawler app skeleton

**Files**: `apps/crawler/package.json`, `apps/crawler/tsconfig.json`, `apps/crawler/src/env.ts`, `apps/crawler/src/types.ts`, `apps/crawler/src/crawler.ts`, `apps/crawler/src/index.ts`

#### Automated Verification:
- [ ] Crawler package manifest is valid JSON: `bun -e 'JSON.parse(await Bun.file("apps/crawler/package.json").text())'`
- [ ] Crawler TypeScript config is valid JSON: `bun -e 'JSON.parse(await Bun.file("apps/crawler/tsconfig.json").text())'`
- [ ] Crawler env validation rejects missing start URLs: `bun -e 'import { getCrawlerEnv } from "./apps/crawler/src/env.ts"; try { getCrawlerEnv({}); process.exit(1); } catch { process.exit(0); }'`
- [ ] Crawler owns Crawlee and Playwright dependencies: `grep -q '"crawlee"' apps/crawler/package.json && grep -q '"playwright"' apps/crawler/package.json`
- [ ] Crawler does not introduce Drizzle table writes before schema exists: `! grep -R "createDb\|insert\|crawlRuns\|crawlItems" apps/crawler/src`

#### Manual Verification:
- [ ] `apps/crawler/src/index.ts` clearly states persistence schema is deferred instead of claiming results are stored.
- [ ] `apps/crawler/src/crawler.ts` owns Crawlee lifecycle (`RequestQueue`, router, `PlaywrightCrawler`, failed-request handling).
- [ ] `apps/crawler/src/types.ts` keeps crawl result data as plain DTOs, not Crawlee/Playwright types.
- [ ] `apps/crawler/package.json` depends on `@comics/db` via `workspace:*` but does not contain MCP/Hono dependencies.

### Slice 4: Remote MCP HTTP API skeleton

**Files**: `apps/mcp-server/package.json`, `apps/mcp-server/tsconfig.json`, `apps/mcp-server/src/env.ts`, `apps/mcp-server/src/server.ts`, `apps/mcp-server/src/index.ts`

#### Automated Verification:
- [ ] MCP package manifest is valid JSON: `bun -e 'JSON.parse(await Bun.file("apps/mcp-server/package.json").text())'`
- [ ] MCP TypeScript config is valid JSON: `bun -e 'JSON.parse(await Bun.file("apps/mcp-server/tsconfig.json").text())'`
- [ ] MCP env validation rejects invalid ports: `bun -e 'import { getMcpHttpEnv } from "./apps/mcp-server/src/env.ts"; try { getMcpHttpEnv({ MCP_PORT: "70000" }); process.exit(1); } catch { process.exit(0); }'`
- [ ] MCP package uses Hono and MCP SDK v2 packages: `grep -q '@modelcontextprotocol/hono' apps/mcp-server/package.json && grep -q '@modelcontextprotocol/server' apps/mcp-server/package.json && grep -q '"hono"' apps/mcp-server/package.json`
- [ ] MCP package does not include browser automation dependencies: `! grep -q '"crawlee"\|"playwright"' apps/mcp-server/package.json`
- [ ] MCP server exposes only storage status, not crawled-item queries: `grep -q 'storage_status' apps/mcp-server/src/server.ts && ! grep -R 'list_crawled_items\|crawlItems\|crawlRuns' apps/mcp-server/src`
- [ ] Terminal workspace setup completes after all files are created: `mise run setup`
- [ ] Terminal workspace typecheck passes after all files are created: `mise run typecheck`
- [ ] Terminal workspace quality check passes after all files are created: `mise run check`

#### Manual Verification:
- [ ] `apps/mcp-server/src/index.ts` uses Hono plus `WebStandardStreamableHTTPServerTransport`, not stdio.
- [ ] `/health` reports `transport: "streamable-http"` and `schema: "deferred"`.
- [ ] Host header validation is configurable with `MCP_ALLOWED_HOSTS` for remote deployment.
- [ ] MCP code does not claim to list or read crawled items before DB tables exist.

## Desired End State

```sh
mise run setup
mise run crawler
mise run mcp
```

```ts
import { createDb, getDbEnv } from "@comics/db";

const env = getDbEnv();
const db = createDb({ fileName: env.fileName });
```

```sh
curl http://localhost:3000/health
# {"ok":true,"name":"comics-mcp-server","transport":"streamable-http","schema":"deferred"}
```

Future content-model work can add Drizzle tables under `packages/db/src/schema.ts`, crawler persistence code under `apps/crawler`, and MCP query tools under `apps/mcp-server` without changing the workspace boundaries.

## File Map

```text
package.json                                      # NEW — root Bun workspace manifest and script graph
.mise.toml                                       # NEW — mise Bun tool pin and task aliases
tsconfig.base.json                               # NEW — shared TypeScript compiler options
tsconfig.json                                    # NEW — root typecheck include config
biome.json                                       # NEW — root Biome quality config
.env.example                                     # NEW — documented env variables
drizzle.config.ts                                # NEW — root Drizzle Kit config
packages/db/package.json                         # NEW — shared DB package manifest
packages/db/tsconfig.json                        # NEW — DB package TS config
packages/db/src/env.ts                           # NEW — DB env validation
packages/db/src/schema.ts                        # NEW — intentionally empty schema module
packages/db/src/client.ts                        # NEW — Bun SQLite Drizzle client factory
packages/db/src/index.ts                         # NEW — DB public exports
apps/crawler/package.json                        # NEW — crawler app manifest
apps/crawler/tsconfig.json                       # NEW — crawler app TS config
apps/crawler/src/env.ts                          # NEW — crawler env validation
apps/crawler/src/types.ts                        # NEW — crawler DTOs
apps/crawler/src/crawler.ts                      # NEW — Crawlee/Playwright lifecycle
apps/crawler/src/index.ts                        # NEW — crawler entrypoint
apps/mcp-server/package.json                     # NEW — MCP HTTP app manifest
apps/mcp-server/tsconfig.json                    # NEW — MCP app TS config
apps/mcp-server/src/env.ts                       # NEW — MCP env validation
apps/mcp-server/src/server.ts                    # NEW — MCP tool registration
apps/mcp-server/src/index.ts                     # NEW — Hono+Bun HTTP entrypoint
```

## Ordering Constraints

- Slice 1 must land before package/app slices because it defines workspace, task, TS, Biome, env, and Drizzle config surfaces.
- Slice 2 must land before apps because app packages depend on `@comics/db`.
- Slice 3 and Slice 4 both depend on Slice 2 and can conceptually be implemented after it, but this design generates them sequentially for review clarity.
- Project-baseline checks such as full typecheck and Biome check belong on the terminal slice after all workspace packages exist.

## Verification Notes

- Verify root setup delegates through Bun scripts: inspect `.mise.toml` tasks and root `package.json` scripts.
- Verify `DB_FILE_NAME` is documented in `.env.example` and validated in `packages/db/src/env.ts`.
- Verify `drizzle.config.ts` points to `./packages/db/src/schema.ts` and `./packages/db/drizzle`.
- Verify `packages/db/src/schema.ts` intentionally exports no concrete tables in this scope.
- Verify crawler dependencies (`crawlee`, `playwright`) appear only in `apps/crawler/package.json`.
- Verify MCP dependencies do not include Crawlee or Playwright.
- Verify MCP server uses Hono+Bun and SDK v2 packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/hono`) rather than stdio.
- Verify no code claims to persist crawler results or list crawled items before schema is introduced.
- At implementation time, run `mise run setup`, `mise run typecheck`, and `mise run check` after all slices are applied.

## Performance Considerations

- SQLite is single-writer; future crawler persistence should keep concurrency modest or batch writes.
- The current scope does not write crawl results, so no immediate SQLite write contention exists.
- Hono+Bun should keep HTTP overhead low for the MCP API skeleton.
- Crawlee result accumulation is in-memory in this skeleton; future persistence work should stream/batch results rather than retain large crawls in memory.

## Migration Notes

No concrete schema tables are introduced in this design, so there is no data migration or rollback DDL. `drizzle.config.ts` and `packages/db/drizzle` are prepared for future migrations once content tables are designed.

## Pattern References

- `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:35-39` — root mise/Bun workspace command shape.
- `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:43-47` — DB package schema/client/env and SQLite locator responsibilities.
- `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:51-56` — crawler app boundary and DTO/storage separation.
- `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:77-80` — root Biome quality layer.
- `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/packages/middleware/hono/README.md` — MCP SDK v2 Hono adapter shape.
- `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/README.md` — v1 SDK notes showing Streamable HTTP exists but v1 examples are not Hono-first.

## Developer Context

**Q (`.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl:1`): The request requires Drizzle ORM storage but does not specify a database dialect. Which database should the skeleton default to?**
A: SQLite local file.

**Q (`.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl:1`): The scan covered mise, Bun, Crawlee/Playwright, Drizzle, and MCP. Is there another required workspace-level concern to include before writing?**
A: 还有biome. Biome should be included as a root-level lint/format/check quality layer.

**Q: About to use `packages/db` as the only Drizzle schema/client/env seam for both crawler writes and MCP reads (`.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:22`, `:43-45`, `:115`). Confirm that direction, or are we moving off it?**
A: Follow DB seam.

**Q: About to make `.mise.toml` delegate stable tasks to root Bun scripts and keep Biome root-only (`.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:35-37`, `:77-80`). Confirm that direction, or are we moving off it?**
A: Follow root graph.

**Q: About to isolate app dependencies so Crawlee/Playwright exist only in `apps/crawler` and MCP stays browser-free (`.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:51`, `:60`, `:117`). Confirm that direction, or are we moving off it?**
A: Follow isolation.

**Q: Research defaulted MCP to stdio (`apps/mcp-server/src/index.ts` connects `StdioServerTransport` at `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:61`; stdout safety at `:65`), but your checkpoint answer said “api 服务”. Which server surface should this design generate?**
A: mcp api 服务.

**Q: For the MCP HTTP API service, should the skeleton use the SDK’s Express-style Streamable HTTP adapter or avoid Express and use a lower-level Bun/Node HTTP bridge?**
A: 可以远程访问的。stdio是本地吗.

**Q: Given you want remote access, should the MCP package be HTTP-only or include a local stdio entrypoint too?**
A: 需要启动http服务？可以使用bun吗？

**Q: 你提到 Hono。对于远程 MCP HTTP API，应该优先选哪条路线？研究原本只列了 `@modelcontextprotocol/sdk` + `zod` (`.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:60`)，而官方 v1 HTTP 示例偏 Express；主分支 README 提到 Hono 中间件但 v2 仍偏新。**
A: hono+bun使用v2.

**Q: Research names `crawlRuns` and `crawlItems` as DB tables (`.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:43`) but only mentions one MCP tool file, `list-crawled-items.ts` (`:63`). Which MCP read API surface should the skeleton expose?**
A: 先不设计表。等到填充内容的时候在设计.

**Q: 是否采用这个通用 `crawl_runs`/`crawl_items` schema 作为当前骨架？它满足研究要求的共享 Drizzle 存储 (`.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:43`, `:56`)，同时把业务内容表延后。**
A: 只建DB骨架.

**Q: 这个选择会让当前骨架暂时不满足“crawler 结果存入数据库、MCP 读取爬虫储存”的完整闭环；研究原要求在 `.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl:1`，共享表建议在 `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md:43-56`。确认要把真实表和读写逻辑延期吗？**
A: 确认延期.

**Q: Design summary above. Ready to proceed to decomposition?**
A: Proceed (Recommended).

**Q: 4 slices for mise-managed Bun workspace skeleton. Slice 1: root tooling foundation. Slices 2-4: DB skeleton package, crawler skeleton, Hono+Bun MCP HTTP API skeleton. Approve decomposition?**
A: Approve (Recommended).

**Micro-checkpoint — Slice 1: Root workspace/tooling foundation.**
Presented package manifest, mise tasks, TS/Biome config, env example, and Drizzle config. Verifier reported Decisions OK / Cross-slice OK / Research OK. Developer answer: Approve (Recommended).

**Micro-checkpoint — Slice 2: Shared DB skeleton package.**
Presented `@comics/db` manifest, env validation, intentionally empty schema, lazy Drizzle Bun SQLite factory, and public exports. Verifier reported Decisions OK / Cross-slice OK / Research OK. Developer answer: Approve (Recommended).

**Micro-checkpoint — Slice 3: Crawler app skeleton.**
Presented crawler manifest, env parser, plain crawl DTOs, Crawlee/Playwright lifecycle, and entrypoint that validates DB env while stating persistence is deferred. Verifier reported Decisions OK / Cross-slice OK / Research OK. Developer answer: Approve (Recommended).

**Micro-checkpoint — Slice 4: Remote MCP HTTP API skeleton.**
Presented MCP manifest, HTTP env parser, Hono+Bun MCP SDK v2 entrypoint, `/health`, `/mcp`, and `storage_status`. Initial verifier warning about missing terminal `mise run setup` criterion was fixed and re-verified. Final verifier reported Decisions OK / Cross-slice OK / Research OK. Developer answer: Approve (Recommended).

## Design History

- Slice 1: Root workspace/tooling foundation — approved as generated
- Slice 2: Shared DB skeleton package — approved as generated
- Slice 3: Crawler app skeleton — approved as generated
- Slice 4: Remote MCP HTTP API skeleton — approved as generated

## References

- `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md`
- `.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl`
- `https://bun.sh/docs/pm/workspaces`
- `https://mise.jdx.dev/lang/bun.html`
- `https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler`
- `https://orm.drizzle.team/docs/get-started/bun-sqlite-new`
- `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/packages/middleware/hono/README.md`
- `https://github.com/modelcontextprotocol/typescript-sdk`
- `https://biomejs.dev/guides/getting-started/`
