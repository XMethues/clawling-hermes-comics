import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const setupDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(setupDir, "../../../..");
const migrationPath = join(projectRoot, "packages/db/drizzle/0000_initial_comic_catalog.sql");
const originalEnv = { ...process.env };

export function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
}

export function tmpSqlitePath(): string {
  return join(tmpdir(), `mcp-server-test-${randomUUID()}.sqlite`);
}

export function cleanupSqlite(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${path}${suffix}`;

    if (existsSync(target)) {
      unlinkSync(target);
    }
  }
}

export function migrateSqlite(path: string): void {
  const sqlite = new Database(path, { create: true });

  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec(readFileSync(migrationPath, "utf8"));
  } finally {
    sqlite.close();
  }
}

export function openWritableSqlite(path: string): Database {
  const sqlite = new Database(path, { create: true });
  sqlite.exec("PRAGMA foreign_keys = ON");

  return sqlite;
}

export interface SourceSeed {
  key: string;
  name?: string;
  baseUrl?: string;
}

export function insertSource(sqlite: Database, seed: SourceSeed): number {
  const now = "2026-07-02T07:00:00Z";
  const result = sqlite
    .query(
      `insert into comic_sources (key, name, base_url, created_at, updated_at)
       values (?, ?, ?, ?, ?)`,
    )
    .run(seed.key, seed.name ?? seed.key, seed.baseUrl ?? `https://${seed.key}.example`, now, now);

  return Number(result.lastInsertRowid);
}

export interface CrawlRunSeed {
  sourceId: number;
  mode?: "probe" | "full";
  status?: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt?: string | null;
  pagesSucceeded?: number;
  pagesFailed?: number;
  comicsStored?: number;
  chaptersStored?: number;
  errorMessage?: string | null;
}

export function insertCrawlRun(sqlite: Database, seed: CrawlRunSeed): number {
  const result = sqlite
    .query(
      `insert into crawl_runs (
         source_id,
         mode,
         status,
         start_urls,
         request_queue_name,
         dataset_name,
         pages_succeeded,
         pages_failed,
         comics_stored,
         chapters_stored,
         error_message,
         started_at,
         finished_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      seed.sourceId,
      seed.mode ?? "probe",
      seed.status ?? "succeeded",
      JSON.stringify(["https://example.test/start"]),
      "test-queue",
      "test-dataset",
      seed.pagesSucceeded ?? 0,
      seed.pagesFailed ?? 0,
      seed.comicsStored ?? 0,
      seed.chaptersStored ?? 0,
      seed.errorMessage ?? null,
      seed.startedAt,
      seed.finishedAt ?? null,
    );

  return Number(result.lastInsertRowid);
}

export interface ComicSeed {
  name: string;
  normalizedName?: string;
  mainImageUrl?: string | null;
  intro?: string | null;
  lastSourceId?: number | null;
}

export function insertComic(sqlite: Database, seed: ComicSeed): number {
  const now = "2026-07-02T07:00:00Z";
  const normalizedName = seed.normalizedName ?? seed.name.toLowerCase().replaceAll(" ", "-");
  const result = sqlite
    .query(
      `insert into comics (
         normalized_name,
         name,
         main_image_url,
         intro,
         last_source_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      normalizedName,
      seed.name,
      seed.mainImageUrl ?? null,
      seed.intro ?? null,
      seed.lastSourceId ?? null,
      now,
      now,
    );

  return Number(result.lastInsertRowid);
}

export interface SourceEntrySeed {
  comicId: number;
  sourceId: number;
  sourceComicKey: string;
  sourceUrl?: string;
  viewCount?: number | null;
  serializationStatus?: "ongoing" | "completed" | "unknown";
  lastCrawlRunId?: number | null;
  lastCrawledAt?: string;
}

export function insertSourceEntry(sqlite: Database, seed: SourceEntrySeed): number {
  const now = "2026-07-02T07:00:00Z";
  const result = sqlite
    .query(
      `insert into comic_source_entries (
         comic_id,
         source_id,
         source_comic_key,
         source_url,
         view_count,
         serialization_status,
         last_crawl_run_id,
         last_crawled_at,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      seed.comicId,
      seed.sourceId,
      seed.sourceComicKey,
      seed.sourceUrl ?? `https://source.example/comics/${seed.sourceComicKey}`,
      seed.viewCount ?? null,
      seed.serializationStatus ?? "unknown",
      seed.lastCrawlRunId ?? null,
      seed.lastCrawledAt ?? now,
      now,
      now,
    );

  return Number(result.lastInsertRowid);
}

export function insertTag(
  sqlite: Database,
  comicId: number,
  tag: string,
  normalizedTag?: string,
): void {
  sqlite
    .query("insert into comic_tags (comic_id, normalized_tag, tag) values (?, ?, ?)")
    .run(comicId, normalizedTag ?? tag.toLowerCase(), tag);
}

export function insertChapter(
  sqlite: Database,
  sourceEntryId: number,
  position: number,
  title = `Chapter ${position}`,
): void {
  const now = "2026-07-02T07:00:00Z";

  sqlite
    .query(
      `insert into comic_chapters (source_entry_id, position, title, url, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sourceEntryId,
      position,
      title,
      `https://source.example/chapters/${sourceEntryId}-${position}`,
      now,
      now,
    );
}
