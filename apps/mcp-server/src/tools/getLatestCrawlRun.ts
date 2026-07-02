import { comicSources, crawlRuns } from "@comics/db";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import type {
  CatalogQueryOptions,
  GetLatestCrawlRunInput,
  LatestCrawlRunResultItem,
} from "../types";
import { type CatalogTool, invalidRequest, parseInput, withCatalogDb } from "./common";

const getLatestCrawlRunInputSchema = z
  .object({
    sourceKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const getLatestCrawlRunInputJsonSchema = {
  type: "object",
  properties: {
    sourceKey: {
      type: "string",
      minLength: 1,
      description: "Optional comic source key. Omit to get one latest run per source.",
    },
  },
  additionalProperties: false,
} satisfies import("@modelcontextprotocol/server").Tool["inputSchema"];

export function parseGetLatestCrawlRunInput(input: unknown): GetLatestCrawlRunInput {
  return parseInput(getLatestCrawlRunInputSchema, input, "get_latest_crawl_run");
}

export async function getLatestCrawlRun(
  input: GetLatestCrawlRunInput = {},
  options?: CatalogQueryOptions,
): Promise<LatestCrawlRunResultItem[]> {
  return withCatalogDb(options, (db) => {
    const sources = input.sourceKey
      ? db
          .select({ id: comicSources.id, key: comicSources.key })
          .from(comicSources)
          .where(eq(comicSources.key, input.sourceKey))
          .all()
      : db
          .select({ id: comicSources.id, key: comicSources.key })
          .from(comicSources)
          .orderBy(asc(comicSources.key))
          .all();

    if (input.sourceKey && sources.length === 0) {
      throw invalidRequest(`Comic source '${input.sourceKey}' was not found.`);
    }

    if (sources.length === 0) {
      return [];
    }

    const sourceIds = sources.map((source) => source.id);
    const runs = db
      .select({
        sourceId: crawlRuns.sourceId,
        mode: crawlRuns.mode,
        status: crawlRuns.status,
        startedAt: crawlRuns.startedAt,
        finishedAt: crawlRuns.finishedAt,
        pagesSucceeded: crawlRuns.pagesSucceeded,
        pagesFailed: crawlRuns.pagesFailed,
        comicsStored: crawlRuns.comicsStored,
        chaptersStored: crawlRuns.chaptersStored,
        errorMessage: crawlRuns.errorMessage,
      })
      .from(crawlRuns)
      .where(inArray(crawlRuns.sourceId, sourceIds))
      .orderBy(desc(crawlRuns.startedAt), desc(crawlRuns.id))
      .all();

    const sourceKeyById = new Map(sources.map((source) => [source.id, source.key]));
    const latestBySourceId = new Map<number, (typeof runs)[number]>();

    for (const run of runs) {
      if (!latestBySourceId.has(run.sourceId)) {
        latestBySourceId.set(run.sourceId, run);
      }
    }

    return sources.flatMap((source) => {
      const run = latestBySourceId.get(source.id);
      const sourceKey = sourceKeyById.get(source.id);

      if (!run || !sourceKey) {
        return [];
      }

      return [
        {
          sourceKey,
          mode: run.mode,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          pagesSucceeded: run.pagesSucceeded,
          pagesFailed: run.pagesFailed,
          comicsStored: run.comicsStored,
          chaptersStored: run.chaptersStored,
          ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
        },
      ];
    });
  });
}

export const getLatestCrawlRunTool: CatalogTool<GetLatestCrawlRunInput> = {
  name: "get_latest_crawl_run",
  title: "Get latest crawl run",
  description: "Return the latest crawl run for one source or one latest run per source.",
  inputSchema: getLatestCrawlRunInputJsonSchema,
  parse: parseGetLatestCrawlRunInput,
  execute: getLatestCrawlRun,
};
