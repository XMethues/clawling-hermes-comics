import type { ComicCrawlerMode, ComicCrawlRunStatus, StandardComicExtract } from "./types";

export interface ComicQualityGates {
  minComics: number;
  minChapters: number;
  maxFailedRequests: number;
  maxMissingImageRatio: number;
  maxZeroChapterRatio: number;
  maxMissingViewCountRatio: number;
  maxUnknownStatusRatio: number;
}

export interface ComicQualityStats {
  total: number;
  missingImages: number;
  missingViewCounts: number;
  unknownStatuses: number;
  zeroChapterEntries: number;
}

export type EnvSource = Record<string, string | undefined>;
export type TerminalCrawlRunStatus = Exclude<ComicCrawlRunStatus, "running">;

export function envPositiveInteger(
  name: string,
  defaultValue: number,
  env: EnvSource = process.env,
): number {
  const value = env[name]?.trim();

  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function envNonNegativeInteger(
  name: string,
  defaultValue: number,
  env: EnvSource = process.env,
): number {
  const value = env[name]?.trim();

  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

export function envRatio(name: string, defaultValue: number, env: EnvSource = process.env): number {
  const value = env[name]?.trim();

  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be a number between 0 and 1.`);
  }

  return parsed;
}

export function loadQualityGatesFromEnv(
  env: EnvSource,
  opts: {
    minProbeComicsEnv: string;
    minFullComicsEnv: string;
  },
  mode: ComicCrawlerMode,
): ComicQualityGates {
  return {
    minComics: envPositiveInteger(
      mode === "probe" ? opts.minProbeComicsEnv : opts.minFullComicsEnv,
      1,
      env,
    ),
    minChapters: 1,
    maxFailedRequests: envNonNegativeInteger("PRODUCTION_CRAWLER_MAX_FAILED_REQUESTS", 0, env),
    maxMissingImageRatio: envRatio("PRODUCTION_CRAWLER_MAX_MISSING_IMAGE_RATIO", 0, env),
    maxZeroChapterRatio: envRatio("PRODUCTION_CRAWLER_MAX_ZERO_CHAPTER_RATIO", 0, env),
    maxMissingViewCountRatio: envRatio(
      "PRODUCTION_CRAWLER_MAX_MISSING_VIEW_COUNT_RATIO",
      0.25,
      env,
    ),
    maxUnknownStatusRatio: envRatio("PRODUCTION_CRAWLER_MAX_UNKNOWN_STATUS_RATIO", 0.75, env),
  };
}

export function createEmptyQualityStats(): ComicQualityStats {
  return {
    total: 0,
    missingImages: 0,
    missingViewCounts: 0,
    unknownStatuses: 0,
    zeroChapterEntries: 0,
  };
}

export function addComicQualityStats(stats: ComicQualityStats, comic: StandardComicExtract): void {
  stats.total += 1;

  if (!comic.mainImageUrl || comic.mainImageUrl.includes("blank.jpg")) {
    stats.missingImages += 1;
  }

  if (comic.viewCount === undefined) {
    stats.missingViewCounts += 1;
  }

  if ((comic.serializationStatus ?? "unknown") === "unknown") {
    stats.unknownStatuses += 1;
  }

  if (!comic.chapters.some((chapter) => chapter.url.trim().length > 0)) {
    stats.zeroChapterEntries += 1;
  }
}

export function ratio(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

export function computeRatioStatus(
  qualityStats: ComicQualityStats,
  gates: ComicQualityGates,
): TerminalCrawlRunStatus {
  if (ratio(qualityStats.missingImages, qualityStats.total) > gates.maxMissingImageRatio) {
    return "failed";
  }

  if (ratio(qualityStats.zeroChapterEntries, qualityStats.total) > gates.maxZeroChapterRatio) {
    return "failed";
  }

  if (ratio(qualityStats.missingViewCounts, qualityStats.total) > gates.maxMissingViewCountRatio) {
    return "failed";
  }

  if (ratio(qualityStats.unknownStatuses, qualityStats.total) > gates.maxUnknownStatusRatio) {
    return "failed";
  }

  return "succeeded";
}
