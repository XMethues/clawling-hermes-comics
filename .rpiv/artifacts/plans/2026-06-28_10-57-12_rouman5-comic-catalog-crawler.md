---
date: 2026-06-28T10:57:12+0800
author: unknown
commit: ebfe742
branch: main
repository: comics
topic: "Rouman5 generic comic catalog crawler"
tags: [plan, crawler, crawlee, playwright, drizzle, sqlite, rouman5, comics]
status: ready
parent: null
phase_count: 4
phases:
  - { n: 1, title: Catalog DB schema }
  - { n: 2, title: Generic crawler contracts and storage }
  - { n: 3, title: Crawlee engine integration }
  - { n: 4, title: Rouman5 adapter and package scripts }
unresolved_phase_count: 0
last_updated: 2026-06-28T10:57:12+0800
last_updated_by: unknown
---

# Rouman5 Generic Comic Catalog Crawler Implementation Plan

## Overview

Build the first production comic catalog crawler in `apps/crawler` for `https://rouman5.com`, while shaping the code as a reusable comic-site crawler framework for future sources. Crawlee/Playwright will continue to own crawling lifecycle, request queues, retries, and browser execution; Drizzle/SQLite will own durable business data for comics, source entries, tags, chapters, and crawl-run audit records.

## Requirements

- Crawl Rouman5's full comic catalog.
- Extract comic name, main image URL, tags, intro/description, and every chapter URL.
- Do not crawl chapter content or page images beyond metadata needed for the main image URL.
- First provide an opt-in crawlability probe before full catalog crawling.
- Keep Rouman5 commands inside `apps/crawler/package.json`; do not add network-sensitive checks to root CI.
- Abstract common comic crawler behavior so later websites share the same output shape and storage path.
- Persist catalog results through Drizzle in the shared SQLite database.
- Do not implement MCP query tools in this plan.

## Current State Analysis

The repository currently has a Bun workspace with a crawler skeleton, an empty shared DB schema, and an MCP server that only reports storage status. There is no site-specific crawler and no durable comic catalog schema yet.

### Key Discoveries

- `apps/crawler/src/crawler.ts:17` exposes `runCrawler(config)` and owns the existing Crawlee lifecycle: storage dir setup, run-scoped `RequestQueue`, router, `PlaywrightCrawler`, and failed-request handling.
- `apps/crawler/src/crawler.ts:23` already uses a run-scoped queue name (`crawler-${crypto.randomUUID()}`), preventing default-queue reuse from skipping requests across runs.
- `apps/crawler/src/env.ts:47` validates comma-separated HTTP/HTTPS start URLs; `apps/crawler/src/env.ts:68` centralizes crawler env parsing.
- `apps/crawler/src/index.ts:6` is a thin bootstrap and `apps/crawler/src/index.ts:10` explicitly says persistence schema is deferred.
- `apps/crawler/src/types.ts:1` keeps plain DTOs with no Crawlee/Playwright type leakage.
- `apps/crawler/package.json:6` owns crawler package scripts; `package.json:16` keeps root typecheck/check/ci deterministic.
- `packages/db/src/schema.ts:1` is intentionally empty and says the first content-modeling pass should add domain tables once crawler result shape is known.
- `packages/db/src/client.ts:21` exposes the shared Drizzle factory; apps should import through `@comics/db` rather than duplicating SQLite setup.
- `apps/mcp-server/src/server.ts:13` only registers `storage_status`, so MCP query tools are outside this plan.
- Rouman5 robots policy was observed as `User-agent: *` with empty `Disallow`; `/sitemap.xml` lists `/`, `/home`, `/books`, and `/search`.
- Rouman5 list pages were observed at `/books?page=0&continued=true` and `/books?page=0&continued=false`, with pagination links through at least `page=44`/`page=54` depending on completion status.
- Rouman5 detail pages use `/books/{bookId}` and chapter URLs use `/books/{bookId}/{zeroBasedChapterIndex}`; those chapter URLs must be extracted but not enqueued.
- Direct DNS from this environment initially resolved `rouman5.com` to `198.18.*` and failed; forcing Cloudflare IPs returned HTTP 200, so the probe must be opt-in and network failures should be reported clearly.

## Desired End State

A developer can probe and then run the Rouman5 catalog crawler from the crawler package:

```sh
bun run --filter @comics/crawler rouman5:probe
bun run --filter @comics/crawler rouman5:crawl
```

The crawler writes normalized business data through Drizzle:

```ts
const summary = await runComicSiteCrawler({
  site: rouman5Site,
  db: createDb(),
  startUrls: rouman5Site.startUrls.full,
  maxRequestsPerCrawl: 500,
  headless: true,
});

console.info(`Stored ${summary.comicsStored} comics and ${summary.chaptersStored} chapter URLs.`);
```

A future website can reuse the same engine by implementing one adapter:

```ts
export const anotherComicSite: ComicSiteAdapter = {
  key: "another-site",
  name: "Another Site",
  baseUrl: "https://example.test",
  startUrls: { probe: ["https://example.test/books"], full: ["https://example.test/books"] },
  classifyUrl(url) { /* LIST | DETAIL | IGNORE */ },
  enqueueFromListPage(context) { /* enqueue list/detail URLs */ },
  extractComic(context) { /* return StandardComicExtract */ },
};
```

## What We're NOT Doing

- Not crawling chapter page contents or image pages; only chapter URLs are persisted.
- Not adding MCP list/search/read tools; MCP remains out of scope for now.
- Not making Rouman5 commands part of root `check`, `ci`, or deterministic offline validation.
- Not relying on Crawlee Dataset as the business database; Crawlee storage remains runtime/diagnostic storage.
- Not doing fuzzy cross-site deduplication; exact normalized comic name matching is the only automatic merge rule.
- Not creating Rouman5-specific database tables; schema is generic for future comic sites.
- Not hardcoding DNS overrides for Cloudflare IPs; network/DNS issues surface in probe output.

## Decisions

### Follow existing Crawlee lifecycle

Ambiguity: whether to extend the current `runCrawler` Crawlee/Playwright shape or replace it with direct HTTP scraping or a separate app.

Explored:
- Option A: Follow `apps/crawler/src/crawler.ts:17-76` and keep request queue/router/failed handler in crawler-owned code. Pro: fits current app dependency boundaries and Playwright needs for a Next.js site. Con: requires adapting current generic text crawler into a site-aware crawler.
- Option B: Use direct HTTP parsing. Pro: lower overhead. Con: Rouman5 is a Cloudflare-fronted Next.js surface and the current app already owns Playwright.

Decision: Follow the existing Crawlee/Playwright lifecycle and add a site-aware comic runner beside the existing generic skeleton.

### Keep Rouman5 commands package-local

Ambiguity: whether to add Rouman5 commands only to `apps/crawler/package.json` or expose them in root/mise scripts.

Explored:
- Option A: Package-local scripts modeled after `apps/crawler/package.json:6-10`. Pro: keeps network-sensitive Rouman5 runs out of root `check`/`ci`. Con: developers need to run package-filtered commands.
- Option B: Root/mise tasks modeled after `.mise.toml:32-34`. Pro: discoverable. Con: easy to mistake for deterministic project checks.

Decision: Add opt-in package-local scripts only.

### Use Drizzle for business catalog persistence

Ambiguity: whether initial crawler output should be JSONL/memory-only or persisted in Drizzle now.

Explored:
- Option A: JSONL first. Pro: fastest and avoids migrations. Con: does not satisfy the desired shared database path.
- Option B: Drizzle now, extending `packages/db/src/schema.ts:1-10`. Pro: establishes durable generic catalog model. Con: requires schema and migration work.
- Option C: Memory/log only. Pro: minimal probe. Con: unusable for full catalog storage.

Decision: Use Drizzle now.

### Do not build MCP query tools in this plan

Ambiguity: after adding catalog tables, whether to update MCP beyond storage status.

Explored:
- Option A: DB/crawler only. Pro: keeps focus on making crawler correct first. Con: MCP cannot query comics yet.
- Option B: Add MCP tools against new tables. Pro: end-to-end read path. Con: broader scope across another app.

Decision: Do not build MCP query tools now. Avoid touching `apps/mcp-server` unless a later plan explicitly covers it.

### Model comics globally with exact-name auto merge

Ambiguity: whether comics are source-scoped entries or global comics related to many website entries.

Explored:
- Option A: Source-scoped records keyed by `source + source_comic_key`. Pro: simplest. Con: conflicts with developer direction that comic-to-website is one-to-many.
- Option B: Global `comics` plus source-entry mapping. Pro: supports one comic appearing on multiple sites. Con: requires a matching rule.

Decision: Use global comics. Match by normalized exact name automatically. A later fuzzy/alias/manual merge feature can improve matching.

### Global fields overwrite from latest crawl

Ambiguity: where to store name/main image/tags/intro when different sites provide different metadata.

Explored:
- Option A: Per-source metadata only. Pro: preserves source differences. Con: no simple global display fields.
- Option B: Global overwrite. Pro: simple query/display model. Con: later source crawls can replace previous source metadata.
- Option C: Both levels. Pro: complete. Con: larger schema and write path now.

Decision: Store requested display fields globally on `comics`; latest successful crawl overwrites `name`, `main_image_url`, `intro`, and tag set.

### Keep `crawl_runs` as business audit, not Crawlee internals

Ambiguity: whether Crawlee's RequestQueue/Dataset already makes a `crawl_runs` table unnecessary.

Explored:
- Option A: Rely only on Crawlee RequestQueue/Dataset. Pro: Crawlee already records queue/dataset state. Con: storage is runtime-local/cloud and not tied to business rows.
- Option B: Add a light Drizzle `crawl_runs` table. Pro: records source, start/end, status, counts, and Crawlee queue/dataset names in the business DB. Con: one more table.

Decision: Add `crawl_runs` for business audit. Crawlee still owns queue, retry, and runtime Dataset storage.

## Phase 1: Catalog DB schema

### Overview

Creates the generic catalog schema foundation. Depends on nothing; all later phases depend on these tables and exports.

### Changes Required:

#### 1. packages/db/src/schema.ts

**File**: `packages/db/src/schema.ts`
**Changes**: MODIFY — replace deferred empty schema with generic comic catalog tables, indexes, and inferred types.

```ts
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const comicSources = sqliteTable(
  "comic_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("comic_sources_key_uq").on(table.key)],
);

export const crawlRuns = sqliteTable(
  "crawl_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => comicSources.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["probe", "full"] }).notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
    startUrls: text("start_urls", { mode: "json" }).$type<string[]>().notNull(),
    requestQueueName: text("request_queue_name"),
    datasetName: text("dataset_name"),
    pagesSucceeded: integer("pages_succeeded").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    comicsStored: integer("comics_stored").notNull().default(0),
    chaptersStored: integer("chapters_stored").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("crawl_runs_source_id_idx").on(table.sourceId),
    index("crawl_runs_status_idx").on(table.status),
  ],
);

export const comics = sqliteTable(
  "comics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    normalizedName: text("normalized_name").notNull(),
    name: text("name").notNull(),
    mainImageUrl: text("main_image_url"),
    intro: text("intro"),
    lastSourceId: integer("last_source_id").references(() => comicSources.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("comics_normalized_name_uq").on(table.normalizedName),
    index("comics_last_source_id_idx").on(table.lastSourceId),
  ],
);

export const comicSourceEntries = sqliteTable(
  "comic_source_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comicId: integer("comic_id")
      .notNull()
      .references(() => comics.id, { onDelete: "cascade" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => comicSources.id, { onDelete: "cascade" }),
    sourceComicKey: text("source_comic_key").notNull(),
    sourceUrl: text("source_url").notNull(),
    lastCrawlRunId: integer("last_crawl_run_id").references(() => crawlRuns.id, {
      onDelete: "set null",
    }),
    lastCrawledAt: text("last_crawled_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("comic_source_entries_source_key_uq").on(table.sourceId, table.sourceComicKey),
    uniqueIndex("comic_source_entries_source_url_uq").on(table.sourceId, table.sourceUrl),
    index("comic_source_entries_comic_id_idx").on(table.comicId),
    index("comic_source_entries_source_id_idx").on(table.sourceId),
  ],
);

export const comicTags = sqliteTable(
  "comic_tags",
  {
    comicId: integer("comic_id")
      .notNull()
      .references(() => comics.id, { onDelete: "cascade" }),
    normalizedTag: text("normalized_tag").notNull(),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.comicId, table.normalizedTag] }),
    index("comic_tags_normalized_tag_idx").on(table.normalizedTag),
  ],
);

export const comicChapters = sqliteTable(
  "comic_chapters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceEntryId: integer("source_entry_id")
      .notNull()
      .references(() => comicSourceEntries.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title"),
    url: text("url").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("comic_chapters_source_entry_url_uq").on(table.sourceEntryId, table.url),
    index("comic_chapters_source_entry_position_idx").on(table.sourceEntryId, table.position),
  ],
);

export const schema = {
  comicSources,
  crawlRuns,
  comics,
  comicSourceEntries,
  comicTags,
  comicChapters,
};

export type DbSchema = typeof schema;

export type ComicSource = typeof comicSources.$inferSelect;
export type NewComicSource = typeof comicSources.$inferInsert;
export type CrawlRun = typeof crawlRuns.$inferSelect;
export type NewCrawlRun = typeof crawlRuns.$inferInsert;
export type Comic = typeof comics.$inferSelect;
export type NewComic = typeof comics.$inferInsert;
export type ComicSourceEntry = typeof comicSourceEntries.$inferSelect;
export type NewComicSourceEntry = typeof comicSourceEntries.$inferInsert;
export type ComicTag = typeof comicTags.$inferSelect;
export type NewComicTag = typeof comicTags.$inferInsert;
export type ComicChapter = typeof comicChapters.$inferSelect;
export type NewComicChapter = typeof comicChapters.$inferInsert;
```

#### 2. packages/db/src/index.ts

**File**: `packages/db/src/index.ts`
**Changes**: MODIFY — export catalog tables and inferred select/insert types through the `@comics/db` boundary.

```ts
export type { ComicsDb, CreateDbOptions } from "./client";
export { closeSqliteDatabase, createDb, createSqliteDatabase } from "./client";
export type { DbEnv, EnvSource } from "./env";
export { getDbEnv } from "./env";
export type {
  Comic,
  ComicChapter,
  ComicSource,
  ComicSourceEntry,
  ComicTag,
  CrawlRun,
  DbSchema,
  NewComic,
  NewComicChapter,
  NewComicSource,
  NewComicSourceEntry,
  NewComicTag,
  NewCrawlRun,
} from "./schema";
export {
  comicChapters,
  comics,
  comicSourceEntries,
  comicSources,
  comicTags,
  crawlRuns,
  schema,
} from "./schema";
```

#### 3. packages/db/src/client.ts:15-19

**File**: `packages/db/src/client.ts`
**Changes**: MODIFY — enable SQLite foreign-key enforcement for every Bun SQLite connection created by the shared DB factory.

```ts
export function createSqliteDatabase(fileName = getDbEnv().fileName): Database {
  mkdirSync(dirname(fileName), { recursive: true });

  const sqlite = new Database(fileName, { create: true });
  sqlite.exec("PRAGMA foreign_keys = ON");

  return sqlite;
}
```

### Success Criteria:

#### Automated Verification:
- [x] DB package typecheck passes: `bun run --filter @comics/db typecheck`
- [x] Drizzle migration generation command succeeds: `mise run db:generate`
- [x] Schema exports all catalog tables: `grep -q "comicSourceEntries" packages/db/src/schema.ts && grep -q "comicChapters" packages/db/src/schema.ts`
- [x] DB client enables SQLite foreign keys: `grep -q 'PRAGMA foreign_keys = ON' packages/db/src/client.ts`

#### Manual Verification:
- [x] Confirm `mise run db:generate` created a new SQLite migration under `packages/db/drizzle/` and review that it creates the six catalog tables.
- [x] Schema uses generic comic/source table names, not Rouman5-specific table names.
- [x] `crawl_runs` records business audit fields and does not replace Crawlee `RequestQueue`/`Dataset` runtime storage.
- [x] Public app boundary remains `@comics/db`; no app imports from `packages/db/src/*` are introduced in this phase.
- [x] `createSqliteDatabase()` enables foreign-key enforcement on each SQLite connection so cascade/set-null constraints are active.

## Phase 2: Generic crawler contracts and storage

### Overview

Defines reusable comic-site contracts and implements Drizzle persistence. Depends on Phase 1; can not run in parallel with Phase 3 or Phase 4.

### Changes Required:

#### 1. apps/crawler/src/types.ts

**File**: `apps/crawler/src/types.ts`
**Changes**: MODIFY — append plain DTOs for comic extraction, crawl config, route labels, and crawl summaries below the existing `CrawlSummary` interface without leaking Crawlee/Playwright types.

```ts
export type ComicCrawlerMode = "probe" | "full";
export type ComicCrawlRunStatus = "running" | "succeeded" | "failed";
export type ComicRouteLabel = "LIST" | "DETAIL";
export type ComicPageKind = ComicRouteLabel | "IGNORE";

export interface ComicSiteMetadata {
  key: string;
  name: string;
  baseUrl: string;
}

export interface ComicSiteStartUrls {
  probe: string[];
  full: string[];
}

export interface ComicChapterExtract {
  title?: string;
  url: string;
  position?: number;
}

export interface StandardComicExtract {
  sourceComicKey: string;
  sourceUrl: string;
  name: string;
  mainImageUrl?: string;
  tags: string[];
  intro?: string;
  chapters: ComicChapterExtract[];
}

export interface ComicStoredResult {
  comicId: number;
  sourceEntryId: number;
  tagsStored: number;
  chaptersStored: number;
}

export interface ComicCrawlError {
  sourceUrl: string;
  loadedUrl?: string;
  retryCount: number;
  errorMessage: string;
}

export interface ComicCrawlSummary {
  sourceKey: string;
  mode: ComicCrawlerMode;
  crawlRunId: number;
  requestQueueName: string;
  datasetName?: string;
  total: number;
  succeeded: number;
  failed: number;
  comicsStored: number;
  chaptersStored: number;
  startedAt: string;
  finishedAt: string;
  errors: ComicCrawlError[];
}
```

#### 2. apps/crawler/src/site.ts

**File**: `apps/crawler/src/site.ts`
**Changes**: NEW — define the generic comic-site adapter interface and helper normalization/deduplication utilities.

```ts
import type { PlaywrightCrawlingContext } from "crawlee";

import type {
  ComicPageKind,
  ComicRouteLabel,
  ComicSiteMetadata,
  ComicSiteStartUrls,
  StandardComicExtract,
} from "./types";

export type ComicSiteCrawlingContext = PlaywrightCrawlingContext;

export interface ComicSiteAdapter extends ComicSiteMetadata {
  startUrls: ComicSiteStartUrls;
  classifyUrl(url: URL): ComicPageKind;
  enqueueFromListPage(context: ComicSiteCrawlingContext): Promise<void>;
  extractComic(context: ComicSiteCrawlingContext): Promise<StandardComicExtract>;
}

export function routeLabelForUrl(site: ComicSiteAdapter, url: string): ComicRouteLabel | undefined {
  const kind = site.classifyUrl(new URL(url));

  return kind === "IGNORE" ? undefined : kind;
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function requireText(value: string | undefined | null, fieldName: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

export function optionalText(value: string | undefined | null): string | undefined {
  const normalized = value?.trim();

  return normalized || undefined;
}

export function toAbsoluteUrl(href: string | undefined | null, baseUrl: string): string | undefined {
  const trimmed = href?.trim();

  if (!trimmed) {
    return undefined;
  }

  return new URL(trimmed, baseUrl).href;
}

export function dedupeBy<T>(items: T[], keyForItem: (item: T) => string): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = keyForItem(item);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function dedupeStrings(values: string[]): string[] {
  return dedupeBy(
    values
      .map((value) => value.trim())
      .filter(Boolean),
    (value) => normalizeName(value),
  );
}
```

#### 3. apps/crawler/src/storage.ts

**File**: `apps/crawler/src/storage.ts`
**Changes**: NEW — implement source/crawl-run/comic/tag/chapter upserts using the shared Drizzle schema.

```ts
import { eq } from "drizzle-orm";

import {
  type ComicSource,
  type ComicsDb,
  type CrawlRun,
  comicChapters,
  comicSourceEntries,
  comicSources,
  comicTags,
  comics,
  crawlRuns,
} from "@comics/db";

import { dedupeBy, normalizeName, requireText } from "./site";
import type {
  ComicCrawlerMode,
  ComicCrawlRunStatus,
  ComicSiteMetadata,
  ComicStoredResult,
  StandardComicExtract,
} from "./types";

export interface StartCrawlRunInput {
  source: ComicSiteMetadata;
  mode: ComicCrawlerMode;
  startUrls: string[];
  requestQueueName: string;
  datasetName?: string;
  startedAt?: string;
}

export interface StartedCrawlRun {
  source: ComicSource;
  crawlRun: CrawlRun;
}

export interface FinishCrawlRunInput {
  crawlRunId: number;
  status: Exclude<ComicCrawlRunStatus, "running">;
  pagesSucceeded: number;
  pagesFailed: number;
  comicsStored: number;
  chaptersStored: number;
  errorMessage?: string;
  finishedAt?: string;
}

export interface StoreExtractedComicInput {
  source: ComicSiteMetadata;
  crawlRunId: number;
  comic: StandardComicExtract;
  crawledAt?: string;
}

interface NormalizedTag {
  normalizedTag: string;
  tag: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nullable(value: string | undefined): string | null {
  return value ?? null;
}

function normalizeTags(tags: string[]): NormalizedTag[] {
  const tagsByNormalized = new Map<string, string>();

  for (const tag of tags) {
    const trimmed = tag.trim();

    if (!trimmed) {
      continue;
    }

    tagsByNormalized.set(normalizeName(trimmed), trimmed);
  }

  return [...tagsByNormalized.entries()].map(([normalizedTag, tag]) => ({ normalizedTag, tag }));
}

export function startCrawlRun(db: ComicsDb, input: StartCrawlRunInput): StartedCrawlRun {
  const now = input.startedAt ?? nowIso();

  return db.transaction((tx) => {
    const source = tx
      .insert(comicSources)
      .values({
        key: input.source.key,
        name: input.source.name,
        baseUrl: input.source.baseUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: comicSources.key,
        set: {
          name: input.source.name,
          baseUrl: input.source.baseUrl,
          updatedAt: now,
        },
      })
      .returning()
      .get();

    const crawlRun = tx
      .insert(crawlRuns)
      .values({
        sourceId: source.id,
        mode: input.mode,
        status: "running",
        startUrls: input.startUrls,
        requestQueueName: input.requestQueueName,
        datasetName: nullable(input.datasetName),
        startedAt: now,
      })
      .returning()
      .get();

    return { source, crawlRun };
  });
}

export function finishCrawlRun(db: ComicsDb, input: FinishCrawlRunInput): CrawlRun {
  const finishedAt = input.finishedAt ?? nowIso();
  const crawlRun = db
    .update(crawlRuns)
    .set({
      status: input.status,
      pagesSucceeded: input.pagesSucceeded,
      pagesFailed: input.pagesFailed,
      comicsStored: input.comicsStored,
      chaptersStored: input.chaptersStored,
      errorMessage: nullable(input.errorMessage),
      finishedAt,
    })
    .where(eq(crawlRuns.id, input.crawlRunId))
    .returning()
    .get();

  if (!crawlRun) {
    throw new Error(`Crawl run ${input.crawlRunId} was not found.`);
  }

  return crawlRun;
}

export function storeExtractedComic(
  db: ComicsDb,
  input: StoreExtractedComicInput,
): ComicStoredResult {
  const now = input.crawledAt ?? nowIso();
  const normalizedName = normalizeName(requireText(input.comic.name, "comic.name"));
  const sourceComicKey = requireText(input.comic.sourceComicKey, "comic.sourceComicKey");
  const sourceUrl = requireText(input.comic.sourceUrl, "comic.sourceUrl");
  const chapters = dedupeBy(
    input.comic.chapters.filter((chapter) => chapter.url.trim().length > 0),
    (chapter) => chapter.url,
  ).map((chapter, index) => ({
    position: chapter.position ?? index,
    title: nullable(chapter.title),
    url: chapter.url,
  }));
  const tags = normalizeTags(input.comic.tags);

  return db.transaction((tx) => {
    const source = tx
      .insert(comicSources)
      .values({
        key: input.source.key,
        name: input.source.name,
        baseUrl: input.source.baseUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: comicSources.key,
        set: {
          name: input.source.name,
          baseUrl: input.source.baseUrl,
          updatedAt: now,
        },
      })
      .returning()
      .get();

    const comic = tx
      .insert(comics)
      .values({
        normalizedName,
        name: input.comic.name,
        mainImageUrl: nullable(input.comic.mainImageUrl),
        intro: nullable(input.comic.intro),
        lastSourceId: source.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: comics.normalizedName,
        set: {
          name: input.comic.name,
          mainImageUrl: nullable(input.comic.mainImageUrl),
          intro: nullable(input.comic.intro),
          lastSourceId: source.id,
          updatedAt: now,
        },
      })
      .returning()
      .get();

    const sourceEntry = tx
      .insert(comicSourceEntries)
      .values({
        comicId: comic.id,
        sourceId: source.id,
        sourceComicKey,
        sourceUrl,
        lastCrawlRunId: input.crawlRunId,
        lastCrawledAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [comicSourceEntries.sourceId, comicSourceEntries.sourceComicKey],
        set: {
          comicId: comic.id,
          sourceUrl,
          lastCrawlRunId: input.crawlRunId,
          lastCrawledAt: now,
          updatedAt: now,
        },
      })
      .returning()
      .get();

    tx.delete(comicTags).where(eq(comicTags.comicId, comic.id)).run();

    if (tags.length > 0) {
      tx.insert(comicTags)
        .values(tags.map((tag) => ({ comicId: comic.id, ...tag })))
        .onConflictDoNothing()
        .run();
    }

    tx.delete(comicChapters).where(eq(comicChapters.sourceEntryId, sourceEntry.id)).run();

    if (chapters.length > 0) {
      tx.insert(comicChapters)
        .values(
          chapters.map((chapter) => ({
            sourceEntryId: sourceEntry.id,
            position: chapter.position,
            title: chapter.title,
            url: chapter.url,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing()
        .run();
    }

    return {
      comicId: comic.id,
      sourceEntryId: sourceEntry.id,
      tagsStored: tags.length,
      chaptersStored: chapters.length,
    };
  });
}
```

#### 4. apps/crawler/package.json

**File**: `apps/crawler/package.json`
**Changes**: MODIFY — add the direct `drizzle-orm` dependency needed by `apps/crawler/src/storage.ts`.

```json
{
  "dependencies": {
    "@comics/db": "workspace:*",
    "crawlee": "latest",
    "drizzle-orm": "latest",
    "playwright": "latest"
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] Crawler package typecheck passes after applying Phase 1 and Phase 2: `bun run --filter @comics/crawler typecheck`
- [x] Generic adapter interface exists: `grep -q "interface ComicSiteAdapter" apps/crawler/src/site.ts`
- [x] Storage writes through the public DB package boundary: `grep -q 'from "@comics/db"' apps/crawler/src/storage.ts && ! grep -R 'packages/db/src' apps/crawler/src`

#### Manual Verification:
- [x] `apps/crawler/src/types.ts` remains plain DTO/type-only code and does not import Crawlee, Playwright, or Drizzle.
- [x] Storage merges comics by normalized exact name and overwrites global `name`, `main_image_url`, `intro`, and tag set.
- [x] Storage replaces chapters per source entry and only stores chapter metadata/URLs, not chapter content.
- [x] `crawl_runs` start/finish helpers record Crawlee queue/dataset names as business audit fields.

## Phase 3: Crawlee engine integration

### Overview

Adds a site-aware comic crawler engine while preserving the existing generic crawler skeleton. Depends on Phase 2; Phase 4 depends on this engine.

### Changes Required:

#### 1. apps/crawler/src/crawler.ts

**File**: `apps/crawler/src/crawler.ts`
**Changes**: MODIFY — add `runComicSiteCrawler` with LIST/DETAIL routing, conservative Crawlee options, failure accounting, and storage integration. Preserve the existing `summarize` helper and `runCrawler(config)` body unchanged.

```ts
// Replace the existing import block at the top of apps/crawler/src/crawler.ts with:
import type { ComicsDb } from "@comics/db";
import {
  createPlaywrightRouter,
  Dataset,
  PlaywrightCrawler,
  type PlaywrightCrawlingContext,
  RequestQueue,
} from "crawlee";

import { type ComicSiteAdapter, routeLabelForUrl } from "./site";
import { finishCrawlRun, startCrawlRun, storeExtractedComic } from "./storage";
import type {
  ComicCrawlError,
  ComicCrawlerMode,
  ComicCrawlSummary,
  ComicStoredResult,
  CrawlerConfig,
  CrawlResult,
  CrawlSummary,
  StandardComicExtract,
} from "./types";

export interface ComicSiteCrawlerConfig {
  db: ComicsDb;
  site: ComicSiteAdapter;
  mode: ComicCrawlerMode;
  startUrls: string[];
  maxRequestsPerCrawl: number;
  headless: boolean;
  storageDir?: string;
  maxConcurrency?: number;
  sameDomainDelaySecs?: number;
  blockRequestUrlPatterns?: string[];
}

interface ComicCrawlCounters {
  succeeded: number;
  failed: number;
  comicsStored: number;
  chaptersStored: number;
  errors: ComicCrawlError[];
}

function createQueueName(siteKey: string, mode: ComicCrawlerMode): string {
  return `comic-${siteKey}-${mode}-${crypto.randomUUID()}`;
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addStoredResult(counters: ComicCrawlCounters, result: ComicStoredResult): void {
  counters.comicsStored += 1;
  counters.chaptersStored += result.chaptersStored;
}

async function handleListPage(site: ComicSiteAdapter, context: PlaywrightCrawlingContext): Promise<void> {
  await site.enqueueFromListPage(context);
  context.log.info(`Queued links from ${context.request.loadedUrl ?? context.request.url}`);
}

async function handleDetailPage(
  config: ComicSiteCrawlerConfig,
  crawlRunId: number,
  dataset: Dataset<StandardComicExtract>,
  counters: ComicCrawlCounters,
  context: PlaywrightCrawlingContext,
): Promise<void> {
  const comic = await config.site.extractComic(context);
  const stored = storeExtractedComic(config.db, {
    source: config.site,
    crawlRunId,
    comic,
    crawledAt: new Date().toISOString(),
  });

  await dataset.pushData(comic);
  addStoredResult(counters, stored);
  context.log.info(`Stored comic ${comic.name} with ${stored.chaptersStored} chapter URL(s).`);
}

// Add this exported function after the existing runCrawler(config) function.
export async function runComicSiteCrawler(
  config: ComicSiteCrawlerConfig,
): Promise<ComicCrawlSummary> {
  if (config.storageDir) {
    process.env.CRAWLEE_STORAGE_DIR = config.storageDir;
  }

  const requestQueueName = createQueueName(config.site.key, config.mode);
  const datasetName = `${requestQueueName}-results`;
  const startedAt = new Date().toISOString();
  const requestQueue = await RequestQueue.open(requestQueueName);
  const dataset = await Dataset.open<StandardComicExtract>(datasetName);
  const counters: ComicCrawlCounters = {
    succeeded: 0,
    failed: 0,
    comicsStored: 0,
    chaptersStored: 0,
    errors: [],
  };

  await requestQueue.addRequests(
    config.startUrls.map((url) => ({
      url,
      label: routeLabelForUrl(config.site, url) ?? "LIST",
    })),
  );

  const { crawlRun } = startCrawlRun(config.db, {
    source: config.site,
    mode: config.mode,
    startUrls: config.startUrls,
    requestQueueName,
    datasetName,
    startedAt,
  });

  const router = createPlaywrightRouter();

  router.addHandler("LIST", async (context) => {
    await handleListPage(config.site, context);
    counters.succeeded += 1;
  });

  router.addHandler("DETAIL", async (context) => {
    await handleDetailPage(config, crawlRun.id, dataset, counters, context);
    counters.succeeded += 1;
  });

  router.addDefaultHandler(async (context) => {
    const label = routeLabelForUrl(config.site, context.request.url);

    if (label === "LIST") {
      await handleListPage(config.site, context);
      counters.succeeded += 1;
      return;
    }

    if (label === "DETAIL") {
      await handleDetailPage(config, crawlRun.id, dataset, counters, context);
      counters.succeeded += 1;
      return;
    }

    context.log.debug(`Ignored ${context.request.url}`);
  });

  const crawler = new PlaywrightCrawler({
    requestQueue,
    requestHandler: router,
    maxRequestsPerCrawl: config.maxRequestsPerCrawl,
    headless: config.headless,
    maxConcurrency: config.maxConcurrency ?? 1,
    sameDomainDelaySecs: config.sameDomainDelaySecs ?? 2,
    respectRobotsTxtFile: true,
    preNavigationHooks: [
      async ({ blockRequests }) => {
        if (config.blockRequestUrlPatterns?.length) {
          await blockRequests({ extraUrlPatterns: config.blockRequestUrlPatterns });
        }
      },
    ],
    failedRequestHandler: async ({ request, log }) => {
      const errorMessage = request.errorMessages.at(-1) ?? "Unknown error";

      counters.failed += 1;
      counters.errors.push({
        sourceUrl: request.url,
        loadedUrl: request.loadedUrl,
        retryCount: request.retryCount,
        errorMessage,
      });

      log.error(`Failed ${request.url}: ${errorMessage}`);
    },
  });

  let runError: unknown;

  try {
    await crawler.run();
  } catch (error) {
    runError = error;
    counters.failed += 1;
    counters.errors.push({
      sourceUrl: config.startUrls.join(","),
      retryCount: 0,
      errorMessage: errorMessageFrom(error),
    });
  }

  const finishedAt = new Date().toISOString();
  const finalStatus = runError || counters.failed > 0 ? "failed" : "succeeded";

  finishCrawlRun(config.db, {
    crawlRunId: crawlRun.id,
    status: finalStatus,
    pagesSucceeded: counters.succeeded,
    pagesFailed: counters.failed,
    comicsStored: counters.comicsStored,
    chaptersStored: counters.chaptersStored,
    errorMessage: counters.errors.at(-1)?.errorMessage,
    finishedAt,
  });

  if (runError) {
    throw runError;
  }

  return {
    sourceKey: config.site.key,
    mode: config.mode,
    crawlRunId: crawlRun.id,
    requestQueueName,
    datasetName,
    total: counters.succeeded + counters.failed,
    succeeded: counters.succeeded,
    failed: counters.failed,
    comicsStored: counters.comicsStored,
    chaptersStored: counters.chaptersStored,
    startedAt,
    finishedAt,
    errors: counters.errors,
  };
}
```

### Success Criteria:

#### Automated Verification:
- [x] Crawler package typecheck passes after applying Phases 1-3: `bun run --filter @comics/crawler typecheck`
- [x] Comic crawler engine export exists: `grep -q "runComicSiteCrawler" apps/crawler/src/crawler.ts`
- [x] Crawlee runtime still uses RequestQueue and respects robots.txt: `grep -q "RequestQueue.open" apps/crawler/src/crawler.ts && grep -q "respectRobotsTxtFile" apps/crawler/src/crawler.ts`

#### Manual Verification:
- [x] Existing `runCrawler(config)` behavior remains available for the skeleton path.
- [x] New comic runner labels LIST/DETAIL pages through the site adapter and never embeds Rouman5-specific selectors.
- [x] New comic runner records Crawlee queue/dataset names into `crawl_runs` through storage helpers.
- [x] Failed requests are counted and finish the business crawl run as failed without replacing Crawlee retry handling.

## Phase 4: Rouman5 adapter and package scripts

### Overview

Implements the first concrete site adapter and opt-in package commands. Depends on Phase 3; terminal phase runs the workspace checks.

### Changes Required:

#### 1. apps/crawler/src/sites/rouman5.ts

**File**: `apps/crawler/src/sites/rouman5.ts`
**Changes**: NEW — implement Rouman5 URL classification, list pagination enqueueing, and detail-page metadata/chapter extraction.

```ts
import { dedupeBy, dedupeStrings, optionalText, requireText, toAbsoluteUrl } from "../site";
import type { ComicSiteAdapter } from "../site";
import type { ComicChapterExtract } from "../types";

const ROUMAN5_BASE_URL = "https://rouman5.com";
const ROUMAN5_ORIGIN = new URL(ROUMAN5_BASE_URL).origin;
const DETAIL_URL_PATTERN = /^https:\/\/rouman5\.com\/books\/[^/?#]+$/i;
const CHAPTER_URL_PATTERN = /^https:\/\/rouman5\.com\/books\/[^/?#]+\/\d+\/?$/i;
const LIST_URL_PATTERN = /^https:\/\/rouman5\.com\/books(?:\?.*)?$/i;

type Rouman5Page = Parameters<ComicSiteAdapter["extractComic"]>[0]["page"];

export const rouman5BlockedUrlPatterns = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  "googletagmanager.com",
  "google-analytics.com",
  "static.cloudflareinsights.com",
  "magsrv.com",
  "clickadu.js",
  "frozenpayerpregnant.com",
  "tsyndicate.com",
];

function isRouman5Url(url: URL): boolean {
  return url.origin === ROUMAN5_ORIGIN;
}

function sourceComicKeyFromUrl(url: URL): string {
  const match = url.pathname.match(/^\/books\/([^/]+)\/?$/);

  if (!match?.[1]) {
    throw new Error(`Rouman5 detail URL expected, got ${url.href}`);
  }

  return match[1];
}

function stripSiteSuffix(value: string): string {
  return value.replace(/\s*-\s*肉漫屋\s*$/u, "").trim();
}

async function metaContent(page: Rouman5Page, selector: string): Promise<string | undefined> {
  return optionalText(
    await page
      .locator(selector)
      .getAttribute("content")
      .catch(() => null),
  );
}

async function extractName(
  contextUrl: string,
  pageTitle: string,
  page: Rouman5Page,
): Promise<string> {
  const ogImageAlt = await metaContent(page, 'meta[property="og:image:alt"]');
  const ogTitle = await metaContent(page, 'meta[property="og:title"]');
  const title =
    optionalText(ogImageAlt) ??
    optionalText(ogTitle ? stripSiteSuffix(ogTitle) : undefined) ??
    stripSiteSuffix(pageTitle);

  return requireText(title, `Rouman5 comic name at ${contextUrl}`);
}

async function extractTags(page: Rouman5Page): Promise<string[]> {
  const tagText = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("div"));
    const tagNode = labels.find((node) => node.textContent?.trim().startsWith("標籤:"));

    return tagNode?.textContent?.replace(/^標籤:\s*/u, "") ?? "";
  });

  return dedupeStrings(tagText.split(/[\s,，、/]+/u));
}

async function extractChapters(
  page: Rouman5Page,
  sourcePath: string,
): Promise<ComicChapterExtract[]> {
  const chapters = await page.locator(`a[href^="${sourcePath}/"]`).evaluateAll((anchors, path) => {
    return anchors
      .map((anchor): ComicChapterExtract | undefined => {
        const href = anchor.getAttribute("href");

        if (!href) {
          return undefined;
        }

        const url = new URL(href, location.href);
        const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = url.pathname.match(new RegExp(`^${escapedPath}/(\\d+)/?$`));

        if (!match?.[1]) {
          return undefined;
        }

        return {
          position: Number(match[1]),
          title: anchor.textContent?.trim() || undefined,
          url: url.href,
        };
      })
      .filter((chapter): chapter is ComicChapterExtract => Boolean(chapter));
  }, sourcePath);

  return dedupeBy(chapters, (chapter) => chapter.url).sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
}

export const rouman5Site: ComicSiteAdapter = {
  key: "rouman5",
  name: "Rouman5",
  baseUrl: ROUMAN5_BASE_URL,
  startUrls: {
    probe: ["https://rouman5.com/books?page=0&continued=true"],
    full: [
      "https://rouman5.com/books?page=0&continued=true",
      "https://rouman5.com/books?page=0&continued=false",
    ],
  },
  classifyUrl(url) {
    if (!isRouman5Url(url)) {
      return "IGNORE";
    }

    if (CHAPTER_URL_PATTERN.test(url.href)) {
      return "IGNORE";
    }

    if (DETAIL_URL_PATTERN.test(url.href)) {
      return "DETAIL";
    }

    if (url.pathname === "/books" || url.pathname === "/home") {
      return "LIST";
    }

    return "IGNORE";
  },
  async enqueueFromListPage({ enqueueLinks }) {
    await enqueueLinks({
      selector: 'a[href^="/books/"]',
      regexps: [DETAIL_URL_PATTERN],
      exclude: [CHAPTER_URL_PATTERN],
      label: "DETAIL",
      strategy: "same-origin",
    });

    await enqueueLinks({
      selector: 'a[href^="/books?"]',
      regexps: [LIST_URL_PATTERN],
      label: "LIST",
      strategy: "same-origin",
    });
  },
  async extractComic({ page, request }) {
    const sourceUrl = new URL(request.loadedUrl ?? request.url);
    const sourcePath = sourceUrl.pathname.replace(/\/$/u, "");
    const pageTitle = await page.title();
    const name = await extractName(sourceUrl.href, pageTitle, page);
    const description =
      (await metaContent(page, 'meta[name="description"]')) ??
      (await metaContent(page, 'meta[property="og:description"]'));
    const imageSrc = await page.locator("img").first().getAttribute("src").catch(() => null);
    const ogImageUrl = await metaContent(page, 'meta[property="og:image"]');
    const imageUrl = ogImageUrl ?? toAbsoluteUrl(imageSrc, sourceUrl.href);
    const chapters = await extractChapters(page, sourcePath);

    return {
      sourceComicKey: sourceComicKeyFromUrl(sourceUrl),
      sourceUrl: sourceUrl.href,
      name,
      mainImageUrl: imageUrl,
      tags: await extractTags(page),
      intro: description,
      chapters,
    };
  },
};
```

#### 2. apps/crawler/src/scripts/rouman5.ts

**File**: `apps/crawler/src/scripts/rouman5.ts`
**Changes**: NEW — add CLI entry for `probe` and `crawl` modes using `rouman5Site` and `runComicSiteCrawler`.

```ts
import { createDb, getDbEnv } from "@comics/db";

import { runComicSiteCrawler } from "../crawler";
import { rouman5BlockedUrlPatterns, rouman5Site } from "../sites/rouman5";
import type { ComicCrawlerMode } from "../types";

function parseMode(value: string | undefined): ComicCrawlerMode {
  if (value === "probe") {
    return "probe";
  }

  if (value === "crawl" || value === "full") {
    return "full";
  }

  throw new Error("Usage: bun run src/scripts/rouman5.ts <probe|crawl>");
}

function parsePositiveInteger(name: string, defaultValue: number): number {
  const value = process.env[name]?.trim();

  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  throw new Error(`${name} must be a boolean value.`);
}

function maxRequestsForMode(mode: ComicCrawlerMode): number {
  return mode === "probe"
    ? parsePositiveInteger("ROUMAN5_PROBE_MAX_REQUESTS", 20)
    : parsePositiveInteger("ROUMAN5_MAX_REQUESTS", 10_000);
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv[2]);
  const dbEnv = getDbEnv();
  const db = createDb({ fileName: dbEnv.fileName });
  const summary = await runComicSiteCrawler({
    db,
    site: rouman5Site,
    mode,
    startUrls: rouman5Site.startUrls[mode],
    maxRequestsPerCrawl: maxRequestsForMode(mode),
    headless: parseBoolean("CRAWLER_HEADLESS", true),
    storageDir: process.env.CRAWLEE_STORAGE_DIR?.trim() || undefined,
    maxConcurrency: parsePositiveInteger("ROUMAN5_MAX_CONCURRENCY", 1),
    sameDomainDelaySecs: parsePositiveInteger("ROUMAN5_SAME_DOMAIN_DELAY_SECS", 2),
    blockRequestUrlPatterns: rouman5BlockedUrlPatterns,
  });

  console.info(
    `Rouman5 ${mode} finished: ${summary.comicsStored} comics, ${summary.chaptersStored} chapter URLs, ${summary.failed} failed request(s).`,
  );

  if (summary.comicsStored < 1) {
    throw new Error(`Rouman5 ${mode} stored zero comics; crawlability check failed.`);
  }

  if (summary.chaptersStored < 1) {
    throw new Error(`Rouman5 ${mode} stored zero chapter URLs; crawlability check failed.`);
  }

  if (summary.failed > 0) {
    throw new Error(`Rouman5 ${mode} finished with ${summary.failed} failed request(s).`);
  }
}

await main().catch((error) => {
  console.error("Rouman5 crawler failed:", error);
  process.exit(1);
});
```

#### 3. apps/crawler/package.json

**File**: `apps/crawler/package.json`
**Changes**: MODIFY — add package-local `rouman5:probe` and `rouman5:crawl` scripts.

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
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "rouman5:probe": "bun run src/scripts/rouman5.ts probe",
    "rouman5:crawl": "bun run src/scripts/rouman5.ts crawl"
  },
  "dependencies": {
    "@comics/db": "workspace:*",
    "crawlee": "latest",
    "drizzle-orm": "latest",
    "playwright": "latest"
  }
}
```

#### 4. .env.example

**File**: `.env.example`
**Changes**: MODIFY — document that Rouman5 commands reuse shared DB/Crawlee env and are opt-in network runs.

```dotenv
# Rouman5 opt-in network crawler. These commands are package-local and are not part of CI.
# Run `bun run --filter @comics/crawler rouman5:probe` before `rouman5:crawl`.
ROUMAN5_PROBE_MAX_REQUESTS=20
ROUMAN5_MAX_REQUESTS=10000
ROUMAN5_MAX_CONCURRENCY=1
ROUMAN5_SAME_DOMAIN_DELAY_SECS=2
```

### Success Criteria:

#### Automated Verification:
- [x] Crawler package manifest is valid JSON: `bun -e 'JSON.parse(await Bun.file("apps/crawler/package.json").text())'`
- [x] Crawler package typecheck passes after all phases: `bun run --filter @comics/crawler typecheck`
- [x] Workspace quality gate passes after all phases: `mise run check`
- [x] Rouman5 scripts are package-local only: `grep -q 'rouman5:probe' apps/crawler/package.json && ! grep -q 'rouman5:probe' package.json && ! grep -q 'rouman5:probe' .mise.toml`
- [x] Rouman5 adapter ignores chapter pages instead of enqueueing them as details: `grep -q 'CHAPTER_URL_PATTERN' apps/crawler/src/sites/rouman5.ts && grep -q 'return "IGNORE"' apps/crawler/src/sites/rouman5.ts`

#### Manual Verification:
- [x] After `mise run db:migrate`, run crawlability probe: `bun run --filter @comics/crawler rouman5:probe`; it should store at least one comic and chapter URL.
- [x] Confirm full crawl starts from both ongoing and completed Rouman5 list pages (`continued=true` and `continued=false`).
- [x] Confirm detail extraction stores comic name, main image URL, tags, intro, and chapter URLs only; no chapter content is fetched.
- [x] If probe fails because local DNS/Cloudflare blocks access, record the network error rather than treating it as a deterministic CI failure.
- [x] Confirm MCP scope stayed unchanged: `grep -R "list_comics\|comic_chapters\|comic query" apps/mcp-server/src` returns no new MCP query tool registration.

## Ordering Constraints

- Phase 1 must complete before Phase 2 because storage imports the Drizzle tables and types.
- Phase 2 must complete before Phase 3 because the engine uses the adapter contracts and storage functions.
- Phase 3 must complete before Phase 4 because Rouman5 scripts call `runComicSiteCrawler`.
- No phases are parallelizable; each slice builds on the prior slice.
- Drizzle migration generation should run after Phase 1 schema changes and before any real crawler write against an existing database.

## Verification Notes

- Schema generation: run `mise run db:generate` after Phase 1 and verify a new SQLite migration appears under `packages/db/drizzle/`.
- Type safety: run `bun run --filter @comics/db typecheck` after Phase 1 and `bun run --filter @comics/crawler typecheck` after phases touching crawler code.
- Workspace quality: run `mise run check` on the terminal phase.
- DB boundary: grep `apps/crawler/src` for direct `packages/db/src` imports; app code must use `@comics/db`.
- MCP scope: grep `apps/mcp-server/src` for `list_comics`, `comic_chapters`, or new DB query tools; this plan should not add MCP tools.
- Crawlee runtime vs business audit: verify `crawl_runs` is written by storage code and Crawlee queue/dataset names are recorded, but crawler still uses `RequestQueue` for URL handling.
- Rouman5 crawlability: run the opt-in probe and require at least one successful detail extraction before running full crawl.
- Chapter content boundary: verify Rouman5 detail handler extracts `/books/{id}/{index}` URLs but never enqueues those chapter URLs.
- Network sensitivity: if probe fails from local DNS/Cloudflare, report the network error; do not make this a CI failure.

## Performance Considerations

- Rouman5 is Cloudflare-fronted and loads ad/analytics scripts; the engine should use low concurrency and request blocking for heavy third-party resources.
- Full crawl should start from both ongoing and completed list pages and rely on Crawlee request de-duplication for repeated detail links.
- Tags and chapters should be replaced in bulk per comic/source-entry to keep results consistent with the latest crawl.
- Avoid loading chapter pages; extracting chapter URLs from detail pages prevents unnecessary bandwidth and risk.
- The exact-name merge rule is O(log n) through a unique index on normalized name rather than fuzzy scanning.

## Migration Notes

- This plan changes persisted schema for the first time. Generate a Drizzle migration after Phase 1 with `mise run db:generate`.
- Existing local SQLite files with no catalog tables must run `mise run db:migrate` before `rouman5:probe` or `rouman5:crawl` writes data.
- Rollback is migration-based; no data backfill is needed before the first crawler run.
- The MCP app is intentionally not updated to query these tables in this plan.

## Pattern References

- `apps/crawler/src/crawler.ts:17-76` — existing Crawlee lifecycle, run-scoped queue, default handler, failed handler, and summary return.
- `apps/crawler/src/env.ts:47-75` — strict centralized env parsing style.
- `apps/crawler/src/index.ts:6-29` — thin top-level bootstrap and non-zero failure exit pattern.
- `apps/crawler/src/types.ts:1-29` — plain DTO pattern without Crawlee/Playwright type leakage.
- `apps/crawler/package.json:6-10` — package-local script pattern.
- `packages/db/src/client.ts:21-24` — shared Drizzle factory boundary.
- `packages/db/src/index.ts:1-6` — public package barrel export pattern.
- `packages/db/src/schema.ts:1-10` — deferred schema comment that this plan replaces with the first content model.

## Developer Context

- Q: "About to follow the existing Crawlee/Playwright lifecycle (`apps/crawler/src/crawler.ts:17-76`) and keep Rouman5 selectors/extraction isolated in a new site module while `index.ts` stays thin (`apps/crawler/src/index.ts:6-29`). Confirm that direction, or are we moving off this pattern?" A: Follow Crawlee.
- Q: "About to follow package-local, opt-in network scripts (`apps/crawler/package.json:6-10`) for the crawlability/full-site commands, keeping them out of root `check`/`ci` (`package.json:16-19`) because rouman5.com is network/DNS-sensitive. Confirm that direction, or are we moving off it?" A: Put commands in the crawler package and make good abstractions because future comic sites have the same content shape but different websites.
- Q: "现有 `@comics/db` schema 仍是空的、并明确把内容建模留到后续（`packages/db/src/schema.ts:1-10`），而 crawler 入口也提示 persistence deferred（`apps/crawler/src/index.ts:10`）。这次 Rouman5 蓝图要把漫画目录结果存到哪里？" A: Drizzle now.
- Q: "既然这次会把 Rouman5 漫画目录写入 Drizzle DB，`apps/mcp-server/src/server.ts:13-39` 目前只返回 storage_status 且写着 schema deferred。MCP 这次要不要也能查询已入库的漫画？" A: 不做 MCP，先把 crawler 做好.
- Q: "你说后续其它漫画网站爬取字段都一样、只是网站不同。`packages/db/src/schema.ts:1-10` 目前为空，这次通用漫画目录 schema 应该怎么建？" A: 使用 normalized，但是要确定好哪些表和字段.
- Q: "设计 normalized schema 时，同一本漫画未来可能出现在不同网站。新表要把漫画当作“站点内条目”，还是先建全局漫画再关联各站点？" A: 全局表，但是不去重。例如 A 站有漫画 X，B 站也有漫画 X，同创建索引.
- Q: "基于你的“通用表、不跨站去重”要求，我建议 schema 为 `comic_sources`、`crawl_runs`、`comics`、`comic_tags`、`comic_chapters`..." A: 漫画和网站是 1 对多的关系.
- Q: "既然漫画和网站是 1 对多关系，后续 B 站爬到同名漫画时，系统如何决定它是否挂到已有 `comics` 记录？" A: Exact name auto.
- Q: "exact-name 自动合并后，不同网站可能给同一漫画不同主图、tag、简介。这些爬取字段应该放在全局 comic 上，还是放在每个网站映射条目上？" A: Global overwrite.
- Q: "Crawlee 是否可以自动创建爬取记录的表 / crawl runs 是不是 Crawlee 负责？" A: Crawlee owns runtime queue/dataset state; Drizzle keeps a light business `crawl_runs` audit table.
- Q: "4 slices for Rouman5 crawler... Approve decomposition?" A: Approve.
- Micro-checkpoint Slice 1 (`packages/db/src/schema.ts`, `packages/db/src/index.ts`): presented generic catalog tables, exact-name index, source-entry mapping, `crawl_runs` audit fields, and `@comics/db` exports. A: Approve as generated.
- Micro-checkpoint Slice 2 (`apps/crawler/src/types.ts`, `apps/crawler/src/site.ts`, `apps/crawler/src/storage.ts`): presented append-only comic DTOs, generic `ComicSiteAdapter`, normalization helpers, and Drizzle upsert helpers. A: Approve as generated.
- Micro-checkpoint Slice 3 (`apps/crawler/src/crawler.ts`): presented generic `runComicSiteCrawler`, LIST/DETAIL routing, conservative Crawlee options, storage integration, and failure accounting. A: Approve as generated.
- Micro-checkpoint Slice 4 (`apps/crawler/src/sites/rouman5.ts`, `apps/crawler/src/scripts/rouman5.ts`, `apps/crawler/package.json`, `.env.example`): presented Rouman5 adapter, probe/full scripts, package-local commands, and env docs. A: Approve as generated.

## Plan History

- Phase 1: Catalog DB schema — revised: Step 9 applied reviewer fix enabling SQLite foreign-key enforcement
- Phase 2: Generic crawler contracts and storage — revised: Step 9 applied reviewer fix adding crawler `drizzle-orm` dependency
- Phase 3: Crawlee engine integration — approved as generated
- Phase 4: Rouman5 adapter and package scripts — revised: Step 9 applied reviewer fixes to Rouman5 adapter/package scripts

## Plan Review (Step 8)

_Independent post-finalization review by artifact-code-reviewer and artifact-coverage-reviewer subagents. Findings triaged at Step 9._

| source | plan-loc | codebase-loc | severity | dimension | finding | recommendation | resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| code | Phase 2 §3 (storage.ts) | apps/crawler/package.json:12 | blocker | actionability | Phase 2 imports `eq` from `drizzle-orm`, but `@comics/crawler` does not declare `drizzle-orm`, so the Phase 2 crawler typecheck cannot resolve that module | Add a Phase 2 `apps/crawler/package.json` change that declares `drizzle-orm` and preserve it in Phase 4's full manifest | applied: added Phase 2 package dependency block and preserved `drizzle-orm` in the Phase 4 full manifest |
| code | Phase 4 §1 (rouman5.ts) | tsconfig.base.json:4 | blocker | codebase-fit | `const labels = [...document.querySelectorAll("div")]` requires `DOM.Iterable`, but the project lib is only `["ES2022", "DOM"]` | Replace the spread with `Array.from(document.querySelectorAll("div"))` | applied: changed Rouman5 tag extraction to `Array.from(document.querySelectorAll("div"))` |
| code | Phase 4 §1 (rouman5.ts) | <n/a> | blocker | code-quality | `.filter((chapter): chapter is ComicChapterExtract => Boolean(chapter))` uses a predicate type with optional `position?`, which is not assignable to the inferred mapped element type where `position` is required | Annotate the map callback return as `ComicChapterExtract &#124; undefined` before filtering | applied: annotated chapter extraction map callback as `ComicChapterExtract | undefined` |
| coverage | ## Verification Notes §5 | <n/a> | blocker | verification-coverage | Note "MCP scope: grep `apps/mcp-server/src` for `list_comics`, `comic_chapters`, or new DB query tools; this plan should not add MCP tools." — criteria NOT FOUND; code NOT FOUND | Add a Phase 4 `#### Manual Verification:` bullet: `grep apps/mcp-server/src for list_comics, comic_chapters, and any new DB query tool registration; confirm none exist.` | applied: added Phase 4 manual MCP-scope grep verification bullet |
| code | Phase 1 §1 (schema.ts) | packages/db/src/client.ts:18 | concern | codebase-fit | Phase 1 adds cascade/set-null foreign keys, but the live SQLite factory returns `new Database(...)` without enabling SQLite foreign-key enforcement | Add a Phase 1 `packages/db/src/client.ts` change that enables `PRAGMA foreign_keys = ON` for DB connections | applied: added Phase 1 `packages/db/src/client.ts` change enabling `PRAGMA foreign_keys = ON` per connection |
| code | Phase 4 §1 (rouman5.ts) | node_modules/.bun/@crawlee+playwright@3.17.0+71f3bd4e73933bab/node_modules/@crawlee/playwright/internals/utils/playwright-utils.d.ts:40 | concern | codebase-fit | `rouman5BlockedUrlPatterns` passes brace/minimatch-style patterns such as `**/*.{png,jpg,jpeg,webp,gif,svg}`, but Crawlee `blockRequests` only supports `*` wildcards | Replace the brace glob with individual supported patterns such as `.webp` and use plain domain substrings for third-party hosts | applied: replaced brace/domain globs with supported individual extension and domain substring patterns |
| code | Phase 4 §2 (rouman5.ts) | <n/a> | concern | code-quality | The probe script only fails on `summary.comicsStored < 1`, so a crawl that stores comics but zero chapter URLs passes the crawlability check | Add a `summary.chaptersStored < 1` failure check | applied: added zero chapter URL failure check to Rouman5 probe/crawl script |

## References

- User request: `@apps/crawler/ 爬虫项目的第一个网站是https://rouman5.com，中的全部漫画。要求漫画名称，主图，tag，简介，以及漫画中每一话的地址（不需要内容）。先测试是否可爬取`
- Crawlee Core API: https://crawlee.dev/js/api/core
- Crawlee RequestQueue API: https://crawlee.dev/js/api/core/class/RequestQueue
- Crawlee Dataset API: https://crawlee.dev/js/api/core/class/Dataset
- Rouman5 robots: `https://rouman5.com/robots.txt`
- Rouman5 sitemap: `https://rouman5.com/sitemap.xml`
- Rouman5 catalog pages: `https://rouman5.com/books?page=0&continued=true`, `https://rouman5.com/books?page=0&continued=false`
- Rouman5 detail/chapter shape example: `https://rouman5.com/books/cm8o9d17j017sel07h1y7yznl` and `/books/cm8o9d17j017sel07h1y7yznl/0`
- Prior research: `.rpiv/artifacts/research/2026-06-26_17-58-45_mise-bun-crawler-mcp-drizzle-biome.md`
- Prior validation: `.rpiv/artifacts/validation/2026-06-27_13-49-19_mise-managed-bun-workspace-skeleton-with-crawlee-drizzle-db-skeleton-hono-mcp-http-api-and-biome.md`
