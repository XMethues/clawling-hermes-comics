import { afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeSqliteDatabase, createDb, createSqliteDatabase } from "@comics/db";

import { runComicSiteCrawler } from "../crawler";
import { rouman5BlockedUrlPatterns, rouman5Site } from "../sites/rouman5";
import {
  cleanupSqlite,
  countSourceEntriesForRun,
  latestCrawlRun,
  makeForbiddenStorageDir,
  migrateSqlite,
  resetEnv,
  runCommand,
  tmpSqlitePath,
  waitForBrowser,
  withRetry,
} from "./setup";

setDefaultTimeout(240_000);

afterEach(() => {
  resetEnv();
});

beforeAll(async () => {
  await waitForBrowser();
});

function permissiveCrawlerEnv(dbFileName: string): Record<string, string> {
  return {
    DB_FILE_NAME: dbFileName,
    CRAWLER_HEADLESS: "true",
    CRAWLEE_STORAGE_DIR: mkdtempSync(join(tmpdir(), "crawler-storage-")),
    ROUMAN5_PROBE_MAX_REQUESTS: "6",
    ROUMAN5_PROBE_MAX_RUNTIME_SECS: "90",
    PRODUCTION_CRAWLER_MAX_FAILED_REQUESTS: "100",
    PRODUCTION_CRAWLER_MAX_MISSING_IMAGE_RATIO: "1",
    PRODUCTION_CRAWLER_MAX_ZERO_CHAPTER_RATIO: "1",
    PRODUCTION_CRAWLER_MAX_MISSING_VIEW_COUNT_RATIO: "1",
    PRODUCTION_CRAWLER_MAX_UNKNOWN_STATUS_RATIO: "1",
  };
}

test.serial("storage launch failure finalizes the crawl run as failed", async () => {
  const dbFileName = tmpSqlitePath();
  migrateSqlite(dbFileName);
  const forbidden = makeForbiddenStorageDir();

  try {
    const result = await runCommand(
      ["bun", "run", "--filter", "@comics/crawler", "rouman5:probe"],
      {
        env: {
          DB_FILE_NAME: dbFileName,
          CRAWLER_HEADLESS: "true",
          CRAWLEE_STORAGE_DIR: forbidden.storageDir,
          ROUMAN5_PROBE_MAX_REQUESTS: "1",
          ROUMAN5_PROBE_MAX_RUNTIME_SECS: "10",
        },
        timeoutMs: 60_000,
      },
    );
    const row = latestCrawlRun(dbFileName);

    expect(result.exitCode).toBe(1);
    expect(row.status).toBe("failed");
    expect(row.finishedAt).toBeTruthy();
  } finally {
    forbidden.cleanup();
    cleanupSqlite(dbFileName);
  }
});

test.serial("finalization errors do not replace the original crawler error", async () => {
  const dbFileName = tmpSqlitePath();
  migrateSqlite(dbFileName);
  const sqlite = createSqliteDatabase(dbFileName);
  const db = createDb({ sqlite });
  const forbidden = makeForbiddenStorageDir();
  process.env.CRAWLEE_STORAGE_DIR = forbidden.storageDir;

  sqlite.exec(`
    create trigger force_crawl_run_finalize_failure
    before update on crawl_runs
    begin
      select raise(rollback, 'forced finalization failure');
    end;
  `);

  try {
    let thrown: unknown;

    try {
      await runComicSiteCrawler({
        db,
        site: rouman5Site,
        mode: "probe",
        startUrls: rouman5Site.startUrls.probe,
        maxRequestsPerCrawl: 1,
        headless: true,
        storageDir: forbidden.storageDir,
        maxConcurrency: 1,
        sameDomainDelaySecs: 1,
        blockRequestUrlPatterns: rouman5BlockedUrlPatterns,
        maxRuntimeSecs: 10,
        qualityGates: {
          minComics: 1,
          minChapters: 1,
          maxFailedRequests: 0,
          maxMissingImageRatio: 1,
          maxZeroChapterRatio: 1,
          maxMissingViewCountRatio: 1,
          maxUnknownStatusRatio: 1,
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeTruthy();
    expect(thrown instanceof Error ? thrown.message : String(thrown)).not.toContain(
      "forced finalization failure",
    );
  } finally {
    closeSqliteDatabase(sqlite);
    forbidden.cleanup();
    cleanupSqlite(dbFileName);
  }
});

test.serial("rouman5 probe exits cleanly and crawl counters match stored DB rows", async () => {
  await withRetry(async () => {
    const dbFileName = tmpSqlitePath();
    migrateSqlite(dbFileName);

    try {
      const result = await runCommand(
        ["bun", "run", "--filter", "@comics/crawler", "rouman5:probe"],
        { env: permissiveCrawlerEnv(dbFileName), timeoutMs: 120_000 },
      );
      const row = latestCrawlRun(dbFileName);
      const storedEntries = countSourceEntriesForRun(dbFileName, row.id);

      expect(result.timedOut).toBe(false);
      expect(result.durationMs).toBeLessThan(120_000);
      expect(result.exitCode).toBe(row.status === "succeeded" ? 0 : 1);
      expect(row.status).not.toBe("running");
      expect(row.finishedAt).toBeTruthy();
      expect(result.stdout).toMatch(
        /Rouman5 probe finished: \d+ comics, \d+ chapter URLs, \d+ failed request\(s\)\./,
      );
      expect(row.comicsStored).toBe(storedEntries);
    } finally {
      cleanupSqlite(dbFileName);
    }
  });
});

test.serial("crawl-run stored comic counter matches source-entry truth", async () => {
  await withRetry(async () => {
    const dbFileName = tmpSqlitePath();
    migrateSqlite(dbFileName);

    try {
      const result = await runCommand(
        ["bun", "run", "--filter", "@comics/crawler", "rouman5:probe"],
        { env: permissiveCrawlerEnv(dbFileName), timeoutMs: 120_000 },
      );
      const row = latestCrawlRun(dbFileName);
      const storedEntries = countSourceEntriesForRun(dbFileName, row.id);

      expect(result.timedOut).toBe(false);
      expect(row.status).not.toBe("running");
      expect(row.comicsStored).toBe(storedEntries);
    } finally {
      cleanupSqlite(dbFileName);
    }
  });
});

test.serial("rouman5 quality gate failure is persisted and returned as exit 1", async () => {
  await withRetry(async () => {
    const dbFileName = tmpSqlitePath();
    migrateSqlite(dbFileName);

    try {
      const result = await runCommand(
        ["bun", "run", "--filter", "@comics/crawler", "rouman5:probe"],
        {
          env: {
            ...permissiveCrawlerEnv(dbFileName),
            ROUMAN5_MIN_PROBE_COMICS: "1000000",
          },
          timeoutMs: 120_000,
        },
      );
      const row = latestCrawlRun(dbFileName);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(row.status).toBe("failed");
      expect(row.finishedAt).toBeTruthy();
    } finally {
      cleanupSqlite(dbFileName);
    }
  });
});

test.serial("production probe writes a stable summary for every selected site", async () => {
  const dbFileName = tmpSqlitePath();
  const summaryPath = join(tmpdir(), `production-summary-${crypto.randomUUID()}.json`);
  migrateSqlite(dbFileName);

  try {
    const result = await runCommand(
      ["bun", "run", "--filter", "@comics/crawler", "production:probe"],
      {
        env: {
          DB_FILE_NAME: dbFileName,
          CRAWLER_HEADLESS: "true",
          CRAWLEE_STORAGE_DIR: mkdtempSync(join(tmpdir(), "crawler-production-storage-")),
          PRODUCTION_CRAWLER_SITES: "rouman5,18comic",
          PRODUCTION_CRAWLER_SUMMARY_PATH: summaryPath,
          PRODUCTION_CRAWLER_SKIP_MIGRATE: "true",
          PRODUCTION_CRAWLER_SKIP_BROWSER_INSTALL: "true",
          PRODUCTION_CRAWLER_SKIP_BACKUP: "true",
          ROUMAN5_PROBE_START_URLS: "https://127.0.0.1:1/never-resolves",
          ROUMAN5_PROBE_MAX_REQUESTS: "1",
          ROUMAN5_PROBE_MAX_RUNTIME_SECS: "30",
          EIGHTEEN_COMIC_PROBE_MAX_REQUESTS: "1",
          EIGHTEEN_COMIC_PROBE_MAX_RUNTIME_SECS: "60",
        },
        timeoutMs: 180_000,
      },
    );
    const summary = await Bun.file(summaryPath).json();

    expect(result.exitCode).toBe(1);
    expect(summary.schemaVersion).toBe(1);
    expect(summary.overallStatus).toBe("failed");
    expect(
      summary.records.map(
        (record: { site: string; mode: string }) => `${record.site}:${record.mode}`,
      ),
    ).toEqual(["18comic:probe", "rouman5:probe"]);

    for (const record of summary.records) {
      expect(record).toHaveProperty("status");
      expect(record).toHaveProperty("crawlRunId");
      expect(record).toHaveProperty("comicsStored");
      expect(record).toHaveProperty("chaptersStored");
      expect(record).toHaveProperty("failedRequests");
    }
  } finally {
    cleanupSqlite(dbFileName);
  }
});
