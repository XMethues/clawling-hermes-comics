import { closeSqliteDatabase, createDb, createSqliteDatabase, getDbEnv } from "@comics/db";

import { runComicSiteCrawler } from "../crawler";
import { loadQualityGatesFromEnv } from "../qualityGates";
import { eighteenComicBlockedUrlPatterns, eighteenComicHanmanSite } from "../sites/18comic";
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

function parseStartUrls(name: string, defaultValue: string[]): string[] {
  const value = process.env[name]?.trim();

  if (!value) {
    return defaultValue;
  }

  const urls = value
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    throw new Error(`${name} must contain at least one URL.`);
  }

  for (const url of urls) {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`${name} must contain only HTTP or HTTPS URLs.`);
    }
  }

  return urls;
}

function startUrlsForMode(mode: ComicCrawlerMode): string[] {
  return mode === "probe"
    ? parseStartUrls("EIGHTEEN_COMIC_PROBE_START_URLS", eighteenComicHanmanSite.startUrls.probe)
    : parseStartUrls("EIGHTEEN_COMIC_HANMAN_START_URLS", eighteenComicHanmanSite.startUrls.full);
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

let exitCode = 1;

async function main(): Promise<void> {
  const mode = parseMode(process.argv[2]);
  const dbEnv = getDbEnv();
  const sqlite = createSqliteDatabase(dbEnv.fileName);
  sqlite.exec("PRAGMA busy_timeout = 30000");

  try {
    const db = createDb({ sqlite });
    const summary = await runComicSiteCrawler({
      db,
      site: eighteenComicHanmanSite,
      mode,
      startUrls: startUrlsForMode(mode),
      maxRequestsPerCrawl: maxRequestsForMode(mode),
      headless: parseBoolean("CRAWLER_HEADLESS", true),
      storageDir: process.env.CRAWLEE_STORAGE_DIR?.trim() || undefined,
      maxConcurrency: parsePositiveInteger("EIGHTEEN_COMIC_MAX_CONCURRENCY", 1),
      sameDomainDelaySecs: parsePositiveInteger("EIGHTEEN_COMIC_SAME_DOMAIN_DELAY_SECS", 3),
      blockRequestUrlPatterns: eighteenComicBlockedUrlPatterns,
      maxRuntimeSecs: maxRuntimeSecsForMode(mode),
      qualityGates: loadQualityGatesFromEnv(
        process.env,
        {
          minProbeComicsEnv: "EIGHTEEN_COMIC_MIN_PROBE_COMICS",
          minFullComicsEnv: "EIGHTEEN_COMIC_HANMAN_MIN_FULL_COMICS",
        },
        mode,
      ),
    });

    console.info(
      `18comic ${mode} finished: ${summary.comicsStored} comics, ${summary.chaptersStored} chapter URLs, ${summary.failed} failed request(s).`,
    );

    exitCode = summary.status === "succeeded" ? 0 : 1;

    if (summary.status !== "succeeded") {
      console.error(
        `18comic ${mode} failed: ${summary.errors.at(-1)?.errorMessage ?? "quality gate failed"}`,
      );
    }
  } finally {
    closeSqliteDatabase(sqlite);
  }
}

await main()
  .catch((error) => {
    console.error("18comic crawler failed:", error);
    exitCode = 1;
  })
  .finally(() => {
    process.exit(exitCode);
  });
