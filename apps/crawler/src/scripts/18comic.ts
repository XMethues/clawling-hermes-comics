import { closeSqliteDatabase, createDb, createSqliteDatabase, getDbEnv } from "@comics/db";

import { runComicSiteCrawler } from "../crawler";
import { eighteenComicBlockedUrlPatterns, eighteenComicHanmanSite } from "../sites/18comic";
import { finishCrawlRun } from "../storage";
import type { ComicCrawlerMode } from "../types";

function parseMode(value: string | undefined): ComicCrawlerMode {
  if (value === "probe") {
    return "probe";
  }

  if (value === "hanman" || value === "crawl" || value === "full") {
    return "full";
  }

  throw new Error("Usage: bun src/scripts/18comic.ts <probe|hanman>");
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
    ? parsePositiveInteger("EIGHTEEN_COMIC_PROBE_MAX_REQUESTS", 6)
    : parsePositiveInteger("EIGHTEEN_COMIC_HANMAN_MAX_REQUESTS", 3_000);
}

function maxRuntimeSecsForMode(mode: ComicCrawlerMode): number {
  return mode === "probe"
    ? parsePositiveInteger("EIGHTEEN_COMIC_PROBE_MAX_RUNTIME_SECS", 300)
    : parsePositiveInteger("EIGHTEEN_COMIC_HANMAN_MAX_RUNTIME_SECS", 21_600);
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv[2]);
  const dbEnv = getDbEnv();
  const sqlite = createSqliteDatabase(dbEnv.fileName);

  try {
    const db = createDb({ sqlite });
    const summary = await runComicSiteCrawler({
      db,
      site: eighteenComicHanmanSite,
      mode,
      startUrls: eighteenComicHanmanSite.startUrls[mode],
      maxRequestsPerCrawl: maxRequestsForMode(mode),
      headless: parseBoolean("CRAWLER_HEADLESS", true),
      storageDir: process.env.CRAWLEE_STORAGE_DIR?.trim() || undefined,
      maxConcurrency: parsePositiveInteger("EIGHTEEN_COMIC_MAX_CONCURRENCY", 1),
      sameDomainDelaySecs: parsePositiveInteger("EIGHTEEN_COMIC_SAME_DOMAIN_DELAY_SECS", 3),
      blockRequestUrlPatterns: eighteenComicBlockedUrlPatterns,
      maxRuntimeSecs: maxRuntimeSecsForMode(mode),
    });

    console.info(
      `18comic ${mode} finished: ${summary.comicsStored} comics, ${summary.chaptersStored} chapter URLs, ${summary.failed} failed request(s).`,
    );

    const qualityErrors: string[] = [];

    if (summary.comicsStored < 1) {
      qualityErrors.push(`18comic ${mode} stored zero comics; crawlability check failed.`);
    }

    if (summary.chaptersStored < 1) {
      qualityErrors.push(`18comic ${mode} stored zero chapter URLs; crawlability check failed.`);
    }

    if (summary.failed > 0) {
      qualityErrors.push(`18comic ${mode} finished with ${summary.failed} failed request(s).`);
    }

    if (qualityErrors.length > 0) {
      finishCrawlRun(db, {
        crawlRunId: summary.crawlRunId,
        status: "failed",
        pagesSucceeded: summary.succeeded,
        pagesFailed: summary.failed,
        comicsStored: summary.comicsStored,
        chaptersStored: summary.chaptersStored,
        errorMessage: qualityErrors.join(" "),
        finishedAt: new Date().toISOString(),
      });
      throw new Error(qualityErrors.join(" "));
    }
  } finally {
    closeSqliteDatabase(sqlite);
  }
}

await main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("18comic crawler failed:", error);
    process.exit(1);
  });
