import {
  type ComicSource,
  type ComicsDb,
  type CrawlRun,
  comicChapters,
  comicSourceEntries,
  comicSources,
  comics,
  comicTags,
  crawlRuns,
} from "@comics/db";
import { eq } from "drizzle-orm";

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

function nullableNumber(value: number | undefined): number | null {
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
        viewCount: nullableNumber(input.comic.viewCount),
        serializationStatus: input.comic.serializationStatus ?? "unknown",
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
          viewCount: nullableNumber(input.comic.viewCount),
          serializationStatus: input.comic.serializationStatus ?? "unknown",
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
