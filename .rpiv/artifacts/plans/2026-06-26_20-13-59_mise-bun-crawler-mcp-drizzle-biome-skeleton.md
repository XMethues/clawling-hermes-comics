---
date: 2026-06-26T20:13:59+0800
author: unknown
commit: no-commit
branch: no-branch
repository: unknown
topic: "mise-managed Bun workspace skeleton with Crawlee, Drizzle DB skeleton, Hono MCP HTTP API, and Biome"
tags: [plan, mise, bun, crawlee, drizzle, mcp, hono, biome]
status: ready
parent: ".rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md"
phase_count: 4
phases:
  - { n: 1, title: Root workspace/tooling foundation }
  - { n: 2, title: Shared DB skeleton package }
  - { n: 3, title: Crawler app skeleton }
  - { n: 4, title: Remote MCP HTTP API skeleton }
last_updated: 2026-06-26T20:13:59+0800
last_updated_by: unknown
---

# mise-managed Bun workspace skeleton Implementation Plan

## Overview

Implement a greenfield mise-managed Bun workspace with a crawler app, a remote Hono+Bun MCP HTTP API app, a shared Drizzle/Bun SQLite DB skeleton package, and root Biome quality tooling. This plan is derived from `.rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md`; each design slice is inherited 1:1 as one implementation phase, and success criteria are copied unchanged from the design's `## Slices` section.

Parallelism per design: Phase 1 must land before package/app slices, Phase 2 must land before app phases, and Phases 3 and 4 are conceptually independent after Phase 2. Full project setup/typecheck/check verification is intentionally placed in the terminal MCP phase after all workspace packages exist.

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

## What We're NOT Doing

- `crawl_runs`, `crawl_items`, or any other concrete Drizzle tables.
- Generated SQL migrations containing table DDL.
- Crawler persistence writes into Drizzle tables.
- MCP tools that list/query crawled items.
- Domain-specific content tables such as comics, chapters, pages, images, authors, tags, or sources.
- Local stdio MCP entrypoint.
- Package-local Biome configs or package-local Biome scripts.

## Phase 1: Root workspace/tooling foundation

### Overview

Create the root Bun workspace manifest, mise task surface, TypeScript configs, Biome config, environment example, and Drizzle Kit config needed by all later packages.

### Changes Required:

#### 1. Root workspace manifest
**File**: `package.json`
**Changes**: Add private Bun workspace manifest and root script graph for setup, browser install, DB commands, app entrypoints, typecheck, Biome checks, fixes, and CI.

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

#### 2. mise task aliases
**File**: `.mise.toml`
**Changes**: Pin Bun, load `.env`, define default project-local environment variables, and delegate stable developer tasks to root Bun scripts.

```toml
[tools]
bun = "1.3.14"

[env]
_.file = ".env"
DB_FILE_NAME = "{{config_root}}/data/comics.sqlite"
CRAWLEE_STORAGE_DIR = "{{config_root}}/storage/crawler"
MCP_HOST = "0.0.0.0"
MCP_PORT = "3000"
MCP_ALLOWED_HOSTS = "localhost,127.0.0.1"

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

#### 3. Shared TypeScript base config
**File**: `tsconfig.base.json`
**Changes**: Add shared strict Bun/ESNext TypeScript compiler settings.

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

#### 4. Root TypeScript project config
**File**: `tsconfig.json`
**Changes**: Add root project include/exclude config for apps, packages, and Drizzle config.

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

#### 5. Root Biome configuration
**File**: `biome.json`
**Changes**: Add root formatter, linter, import organizer, VCS, and workspace ignore configuration.

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

#### 6. Environment example
**File**: `.env.example`
**Changes**: Document shared DB, crawler, Crawlee storage, and MCP HTTP service environment variables.

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

#### 7. Drizzle Kit config
**File**: `drizzle.config.ts`
**Changes**: Add root Drizzle Kit configuration that requires `DB_FILE_NAME`, points at the shared DB schema, and writes migrations under the DB package.

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

### Success Criteria:

#### Automated Verification:
- [x] Root package manifest is valid JSON: `bun -e 'JSON.parse(await Bun.file("package.json").text())'`
- [x] TypeScript base config is valid JSON: `bun -e 'JSON.parse(await Bun.file("tsconfig.base.json").text())'`
- [x] Root TypeScript config is valid JSON: `bun -e 'JSON.parse(await Bun.file("tsconfig.json").text())'`
- [x] Biome config is valid JSON: `bun -e 'JSON.parse(await Bun.file("biome.json").text())'`
- [x] Drizzle config points at the shared DB package schema: `grep -q './packages/db/src/schema.ts' drizzle.config.ts`

#### Manual Verification:
- [ ] `.mise.toml` tasks delegate to root Bun scripts instead of duplicating command logic.
- [ ] `package.json` does not define an `install` lifecycle script, avoiding recursive `bun install` behavior.
- [ ] `.env.example` documents shared DB, crawler, and MCP HTTP service variables.
- [ ] Full `mise run check` is intentionally deferred until all workspace packages exist in Slice 4.

---

## Phase 2: Shared DB skeleton package

### Overview

Create the shared `@comics/db` package with migration scripts, DB env validation, an intentionally empty schema, lazy Bun SQLite + Drizzle client factory, and public exports for app consumers.

### Changes Required:

#### 1. DB package manifest
**File**: `packages/db/package.json`
**Changes**: Add shared DB package manifest, exports, migration scripts, Drizzle ORM dependency, and Drizzle Kit dev dependency.

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
    "db:generate": "cd ../.. && drizzle-kit generate --config drizzle.config.ts",
    "db:migrate": "cd ../.. && drizzle-kit migrate --config drizzle.config.ts"
  },
  "dependencies": {
    "drizzle-orm": "latest"
  },
  "devDependencies": {
    "drizzle-kit": "latest"
  }
}
```

#### 2. DB TypeScript config
**File**: `packages/db/tsconfig.json`
**Changes**: Add package-local TypeScript config extending the root base config.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

#### 3. DB environment validation
**File**: `packages/db/src/env.ts`
**Changes**: Validate `DB_FILE_NAME` and expose DB env/source types.

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

#### 4. Empty Drizzle schema module
**File**: `packages/db/src/schema.ts`
**Changes**: Add intentionally empty initial schema module and schema type.

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

#### 5. Bun SQLite Drizzle client factory
**File**: `packages/db/src/client.ts`
**Changes**: Add lazy SQLite database creation, Drizzle client factory, client type, and close helper.

```ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { drizzle } from "drizzle-orm/bun-sqlite";

import { getDbEnv } from "./env";
import { schema } from "./schema";

export interface CreateDbOptions {
  fileName?: string;
  sqlite?: Database;
}

export function createSqliteDatabase(fileName = getDbEnv().fileName): Database {
  mkdirSync(dirname(fileName), { recursive: true });

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

#### 6. DB public exports
**File**: `packages/db/src/index.ts`
**Changes**: Re-export env, client, and schema APIs for app packages.

```ts
export type { DbEnv, EnvSource } from "./env";
export { getDbEnv } from "./env";
export type { CreateDbOptions, ComicsDb } from "./client";
export { closeSqliteDatabase, createDb, createSqliteDatabase } from "./client";
export type { DbSchema } from "./schema";
export { schema } from "./schema";
```

### Success Criteria:

#### Automated Verification:
- [x] DB package manifest is valid JSON: `bun -e 'JSON.parse(await Bun.file("packages/db/package.json").text())'`
- [x] DB package TypeScript config is valid JSON: `bun -e 'JSON.parse(await Bun.file("packages/db/tsconfig.json").text())'`
- [x] DB env validation rejects missing `DB_FILE_NAME`: `bun -e 'import { getDbEnv } from "./packages/db/src/env.ts"; try { getDbEnv({}); process.exit(1); } catch { process.exit(0); }'`
- [x] DB schema is intentionally empty in this scope: `grep -q 'export const schema = {}' packages/db/src/schema.ts`
- [x] DB client uses Drizzle Bun SQLite: `grep -q 'drizzle-orm/bun-sqlite' packages/db/src/client.ts`

#### Manual Verification:
- [ ] `packages/db/src/schema.ts` contains no concrete tables, matching the developer decision to defer schema design.
- [ ] `packages/db/package.json` owns `drizzle-kit` and its migration scripts cd to the repo root before using root `drizzle.config.ts`.
- [ ] `createDb` is a factory, not an eager singleton, so merely importing `@comics/db` does not open SQLite.
- [ ] Public exports keep apps dependent on `@comics/db` instead of driver-specific setup.

---

## Phase 3: Crawler app skeleton

### Overview

Create the `@comics/crawler` app package with Crawlee/Playwright dependencies, crawler env validation, plain crawl result DTOs, Crawlee lifecycle code, and an entrypoint that validates DB env while making persistence deferral explicit.

### Changes Required:

#### 1. Crawler package manifest
**File**: `apps/crawler/package.json`
**Changes**: Add crawler app manifest, scripts, `@comics/db` workspace dependency, and Crawlee/Playwright dependencies.

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

#### 2. Crawler TypeScript config
**File**: `apps/crawler/tsconfig.json`
**Changes**: Add package-local TypeScript config extending the root base config.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

#### 3. Crawler environment parsing
**File**: `apps/crawler/src/env.ts`
**Changes**: Validate start URLs, positive max request count, booleans, and optional Crawlee storage dir.

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
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("CRAWLER_START_URLS must contain only HTTP or HTTPS URLs.");
    }
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

#### 4. Crawler DTOs
**File**: `apps/crawler/src/types.ts`
**Changes**: Add plain crawler config, result, result status, and summary DTOs.

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

#### 5. Crawlee + Playwright lifecycle
**File**: `apps/crawler/src/crawler.ts`
**Changes**: Add Crawlee request queue setup, Playwright crawler/router handlers, result collection, failure handling, and summary generation.

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
  const requestQueue = await RequestQueue.open(`crawler-${crypto.randomUUID()}`);

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
    failedRequestHandler: async ({ request, log }) => {
      const errorMessage = request.errorMessages.at(-1) ?? "Unknown error";

      results.push({
        requestUniqueKey: request.uniqueKey,
        sourceUrl: request.url,
        loadedUrl: request.loadedUrl,
        status: "failed",
        retryCount: request.retryCount,
        errorMessage,
        crawledAt: new Date().toISOString(),
      });

      log.error(`Failed ${request.url}: ${errorMessage}`);
    },
  });

  await crawler.run();

  return summarize(results);
}
```

#### 6. Crawler entrypoint
**File**: `apps/crawler/src/index.ts`
**Changes**: Validate DB and crawler env, state persistence schema deferral, run the crawler, log summary, and fail process on errors.

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

### Success Criteria:

#### Automated Verification:
- [x] Crawler package manifest is valid JSON: `bun -e 'JSON.parse(await Bun.file("apps/crawler/package.json").text())'`
- [x] Crawler TypeScript config is valid JSON: `bun -e 'JSON.parse(await Bun.file("apps/crawler/tsconfig.json").text())'`
- [x] Crawler env validation rejects missing start URLs: `bun -e 'import { getCrawlerEnv } from "./apps/crawler/src/env.ts"; try { getCrawlerEnv({}); process.exit(1); } catch { process.exit(0); }'`
- [x] Crawler owns Crawlee and Playwright dependencies: `grep -q '"crawlee"' apps/crawler/package.json && grep -q '"playwright"' apps/crawler/package.json`
- [x] Crawler does not introduce Drizzle table writes before schema exists: `! grep -R "createDb\|insert\|crawlRuns\|crawlItems" apps/crawler/src`

#### Manual Verification:
- [ ] `apps/crawler/src/index.ts` clearly states persistence schema is deferred instead of claiming results are stored.
- [ ] `apps/crawler/src/crawler.ts` owns Crawlee lifecycle (`RequestQueue`, router, `PlaywrightCrawler`, failed-request handling).
- [ ] `apps/crawler/src/types.ts` keeps crawl result data as plain DTOs, not Crawlee/Playwright types.
- [ ] `apps/crawler/package.json` depends on `@comics/db` via `workspace:*` but does not contain MCP/Hono dependencies.

---

## Phase 4: Remote MCP HTTP API skeleton

### Overview

Create the `@comics/mcp-server` package with Hono+Bun MCP SDK v2 dependencies, HTTP service env validation, MCP server/tool registration, `/health`, `/mcp`, host-header validation, and terminal workspace verification.

### Changes Required:

#### 1. MCP package manifest
**File**: `apps/mcp-server/package.json`
**Changes**: Add MCP HTTP app manifest, scripts, `@comics/db` workspace dependency, Hono, MCP SDK v2 packages, and Zod.

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

#### 2. MCP TypeScript config
**File**: `apps/mcp-server/tsconfig.json`
**Changes**: Add package-local TypeScript config extending the root base config.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

#### 3. MCP HTTP env parsing
**File**: `apps/mcp-server/src/env.ts`
**Changes**: Validate server metadata, host, port, and optional allowed host list.

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

#### 4. MCP server and tool registration
**File**: `apps/mcp-server/src/server.ts`
**Changes**: Build the MCP server and register the `storage_status` tool that reports DB file and deferred schema status.

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

#### 5. Hono + Bun HTTP entrypoint
**File**: `apps/mcp-server/src/index.ts`
**Changes**: Wire Hono, optional host header validation, `/health`, `/mcp`, Bun HTTP serving, MCP transport connection, and shutdown handling.

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

### Success Criteria:

#### Automated Verification:
- [x] MCP package manifest is valid JSON: `bun -e 'JSON.parse(await Bun.file("apps/mcp-server/package.json").text())'`
- [x] MCP TypeScript config is valid JSON: `bun -e 'JSON.parse(await Bun.file("apps/mcp-server/tsconfig.json").text())'`
- [x] MCP env validation rejects invalid ports: `bun -e 'import { getMcpHttpEnv } from "./apps/mcp-server/src/env.ts"; try { getMcpHttpEnv({ MCP_PORT: "70000" }); process.exit(1); } catch { process.exit(0); }'`
- [x] MCP package uses Hono and MCP SDK v2 packages: `grep -q '@modelcontextprotocol/hono' apps/mcp-server/package.json && grep -q '@modelcontextprotocol/server' apps/mcp-server/package.json && grep -q '"hono"' apps/mcp-server/package.json`
- [x] MCP package does not include browser automation dependencies: `! grep -q '"crawlee"\|"playwright"' apps/mcp-server/package.json`
- [x] MCP server exposes only storage status, not crawled-item queries: `grep -q 'storage_status' apps/mcp-server/src/server.ts && ! grep -R 'list_crawled_items\|crawlItems\|crawlRuns' apps/mcp-server/src`
- [x] Terminal workspace setup completes after all files are created: `mise run setup`
- [x] Terminal workspace typecheck passes after all files are created: `mise run typecheck`
- [x] Terminal workspace quality check passes after all files are created: `mise run check`

#### Manual Verification:
- [ ] `apps/mcp-server/src/index.ts` uses Hono plus `WebStandardStreamableHTTPServerTransport`, not stdio.
- [ ] `/health` reports `transport: "streamable-http"` and `schema: "deferred"`.
- [ ] Host header validation is configurable with `MCP_ALLOWED_HOSTS` for remote deployment.
- [ ] MCP code does not claim to list or read crawled items before DB tables exist.

---

## Testing Strategy

### Automated:
- Validate JSON manifests/configs with `bun -e 'JSON.parse(await Bun.file(...).text())'` as listed in phase success criteria.
- Verify `drizzle.config.ts` points at `./packages/db/src/schema.ts` and that the DB client imports `drizzle-orm/bun-sqlite`.
- Verify env validators reject missing/invalid required values with the phase-level Bun one-liners.
- Verify package dependency boundaries with `grep`: Crawlee/Playwright only in the crawler app; Hono/MCP SDK v2 in the MCP app; no crawled-item query/table names before schema design.
- After all phases land, run `mise run setup`, `mise run typecheck`, and `mise run check`.

### Manual Testing Steps:
1. Verify root setup delegates through Bun scripts by inspecting `.mise.toml` tasks and root `package.json` scripts.
2. Verify `DB_FILE_NAME` is documented in `.env.example` and validated in `packages/db/src/env.ts`.
3. Verify `drizzle.config.ts` points to `./packages/db/src/schema.ts` and `./packages/db/drizzle`.
4. Verify `packages/db/src/schema.ts` intentionally exports no concrete tables in this scope.
5. Verify crawler dependencies (`crawlee`, `playwright`) appear only in `apps/crawler/package.json`.
6. Verify MCP dependencies do not include Crawlee or Playwright.
7. Verify MCP server uses Hono+Bun and SDK v2 packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/hono`) rather than stdio.
8. Verify no code claims to persist crawler results or list crawled items before schema is introduced.
9. At implementation time, run `mise run setup`, `mise run typecheck`, and `mise run check` after all slices are applied.

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

## Plan Review (Step 4)

_Independent post-finalization review by artifact-code-reviewer and artifact-coverage-reviewer subagents. Findings triaged at Step 5._

| source | plan-loc | codebase-loc | severity | dimension | finding | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| code | Phase 2 §1 (package.json) | <n/a> | blocker | actionability | `db:generate` and `db:migrate` run from `packages/db` while `drizzle.config.ts` uses root-relative `./packages/db/...` paths, so Drizzle Kit will look under `packages/db/packages/db/...` and fail to find the schema/migrations | Run Drizzle Kit from the repo root with `cd ../.. && drizzle-kit ... --config drizzle.config.ts` or move the config into `packages/db` with package-relative paths | applied (plan-local; design follow-up: `.rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md`): DB scripts now cd to repo root and use root `drizzle.config.ts`. |
| code | Phase 3 §5 (crawler.ts) | <n/a> | blocker | code-quality | `failedRequestHandler: async ({ request, error, log })` destructures `error` from Crawlee's context object, but failed request errors are not exposed on that object under Crawlee's typed handler shape | Remove `error` from the destructuring and derive the message from `request.errorMessages.at(-1) ?? "Unknown error"` | applied (plan-local; design follow-up: `.rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md`): failed handler now derives the message from `request.errorMessages`. |
| code | Phase 1 §2 (.mise.toml) | <n/a> | concern | codebase-fit | Phase 1 says to pin Bun, but `.mise.toml` uses `bun = "latest"`, so the toolchain can drift between installs | Replace `latest` with a concrete Bun version | applied (plan-local; design follow-up: `.rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md`): pinned Bun to `1.3.14`. |
| code | Phase 2 §5 (client.ts) | <n/a> | concern | code-quality | `createSqliteDatabase` opens `{{config_root}}/data/comics.sqlite` without creating the parent `data/` directory, so the desired `createDb` path can fail with `SQLITE_CANTOPEN` on a fresh checkout | Create `dirname(fileName)` before `new Database(...)` or add a setup step that creates `data/` | applied (plan-local; design follow-up: `.rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md`): client now creates the SQLite parent directory before opening. |
| code | Phase 3 §3 (env.ts) | <n/a> | concern | code-quality | `parseStartUrls` accepts any syntactically valid URL, including non-web schemes that Playwright/Crawlee should not crawl | Reject URLs whose protocol is not `http:` or `https:` | applied (plan-local; design follow-up: `.rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md`): crawler env now rejects non-HTTP/HTTPS URLs. |
| code | Phase 3 §5 (crawler.ts) | <n/a> | concern | code-quality | `RequestQueue.open()` uses the persistent default queue, so repeated runs with the same `CRAWLEE_STORAGE_DIR` can skip already-handled start URLs | Use a run-scoped queue name or purge the queue before adding start URLs | applied (plan-local; design follow-up: `.rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md`): crawler now opens a run-scoped request queue. |
| code | Phase 4 §5 (index.ts) | <n/a> | concern | code-quality | The default `mise run mcp` path binds `MCP_HOST` to `0.0.0.0` but leaves `MCP_ALLOWED_HOSTS` unset, so `if (env.allowedHosts.length > 0)` disables host-header validation by default | Add a default `MCP_ALLOWED_HOSTS` in `.mise.toml` or default `allowedHosts` in `getMcpHttpEnv` | applied (plan-local; design follow-up: `.rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md`): `.mise.toml` now defaults `MCP_ALLOWED_HOSTS` to `localhost,127.0.0.1`. |

## Developer Context


## References

- Design: `.rpiv/artifacts/designs/2026-06-26_18-18-54_mise-bun-crawler-mcp-drizzle-biome-skeleton.md`
- Research: `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md`
- Workflow run: `.rpiv/workflows/runs/2026-06-26_17-58-45-87d4.jsonl`
