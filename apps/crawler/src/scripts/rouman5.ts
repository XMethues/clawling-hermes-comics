import { closeSqliteDatabase, createDb, createSqliteDatabase, getDbEnv } from "@comics/db";

import { runComicSiteCrawler } from "../crawler";
import { loadQualityGatesFromEnv } from "../qualityGates";
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
    ? parseStartUrls("ROUMAN5_PROBE_START_URLS", rouman5Site.startUrls.probe)
    : parseStartUrls("ROUMAN5_FULL_START_URLS", rouman5Site.startUrls.full);
}

function maxRequestsForMode(mode: ComicCrawlerMode): number {
  return mode === "probe"
    ? parsePositiveInteger("ROUMAN5_PROBE_MAX_REQUESTS", 20)
    : parsePositiveInteger("ROUMAN5_MAX_REQUESTS", 10_000);
}

function maxRuntimeSecsForMode(mode: ComicCrawlerMode): number {
  return mode === "probe"
    ? parsePositiveInteger("ROUMAN5_PROBE_MAX_RUNTIME_SECS", 300)
    : parsePositiveInteger("ROUMAN5_MAX_RUNTIME_SECS", 14_400);
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
      site: rouman5Site,
      mode,
      startUrls: startUrlsForMode(mode),
      maxRequestsPerCrawl: maxRequestsForMode(mode),
      headless: parseBoolean("CRAWLER_HEADLESS", true),
      storageDir: process.env.CRAWLEE_STORAGE_DIR?.trim() || undefined,
      maxConcurrency: parsePositiveInteger("ROUMAN5_MAX_CONCURRENCY", 1),
      sameDomainDelaySecs: parsePositiveInteger("ROUMAN5_SAME_DOMAIN_DELAY_SECS", 2),
      blockRequestUrlPatterns: rouman5BlockedUrlPatterns,
      maxRuntimeSecs: maxRuntimeSecsForMode(mode),
      qualityGates: loadQualityGatesFromEnv(
        process.env,
        {
          minProbeComicsEnv: "ROUMAN5_MIN_PROBE_COMICS",
          minFullComicsEnv: "ROUMAN5_MIN_FULL_COMICS",
        },
        mode,
      ),
    });

    console.info(
      `Rouman5 ${mode} finished: ${summary.comicsStored} comics, ${summary.chaptersStored} chapter URLs, ${summary.failed} failed request(s).`,
    );

    exitCode = summary.status === "succeeded" ? 0 : 1;

    if (summary.status !== "succeeded") {
      console.error(
        `Rouman5 ${mode} failed: ${summary.errors.at(-1)?.errorMessage ?? "quality gate failed"}`,
      );
    }
  } finally {
    closeSqliteDatabase(sqlite);
  }
}

await main()
  .catch((error) => {
    console.error("Rouman5 crawler failed:", error);
    exitCode = 1;
  })
  .finally(() => {
    process.exit(exitCode);
  });
