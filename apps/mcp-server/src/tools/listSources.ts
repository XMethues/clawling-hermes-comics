import { comicSourceEntries, comicSources, crawlRuns } from "@comics/db";
import { asc, count, desc } from "drizzle-orm";
import { z } from "zod/v4";

import type { CatalogQueryOptions, ListSourcesResultItem } from "../types";
import { type CatalogTool, emptyInputJsonSchema, parseInput, withCatalogDb } from "./common";

const listSourcesInputSchema = z.object({}).strict();

export const listSourcesInputJsonSchema = emptyInputJsonSchema;

export function parseListSourcesInput(input: unknown): Record<string, never> {
  return parseInput(listSourcesInputSchema, input, "list_sources");
}

export async function listSources(
  _input: Record<string, never> = {},
  options?: CatalogQueryOptions,
): Promise<ListSourcesResultItem[]> {
  return withCatalogDb(options, (db) => {
    const sources = db
      .select({
        id: comicSources.id,
        key: comicSources.key,
        name: comicSources.name,
        baseUrl: comicSources.baseUrl,
      })
      .from(comicSources)
      .orderBy(asc(comicSources.key))
      .all();

    const runs = db
      .select({
        sourceId: crawlRuns.sourceId,
        status: crawlRuns.status,
        startedAt: crawlRuns.startedAt,
      })
      .from(crawlRuns)
      .orderBy(desc(crawlRuns.startedAt), desc(crawlRuns.id))
      .all();

    const counts = db
      .select({
        sourceId: comicSourceEntries.sourceId,
        count: count(),
      })
      .from(comicSourceEntries)
      .groupBy(comicSourceEntries.sourceId)
      .all();

    const latestRunBySource = new Map<number, (typeof runs)[number]>();
    const comicCountBySource = new Map<number, number>();

    for (const run of runs) {
      if (!latestRunBySource.has(run.sourceId)) {
        latestRunBySource.set(run.sourceId, run);
      }
    }

    for (const row of counts) {
      comicCountBySource.set(row.sourceId, Number(row.count));
    }

    return sources.map((source) => {
      const latestRun = latestRunBySource.get(source.id);

      return {
        key: source.key,
        name: source.name,
        baseUrl: source.baseUrl,
        latestRunStatus: latestRun?.status ?? null,
        latestRunAt: latestRun?.startedAt ?? null,
        comicCount: comicCountBySource.get(source.id) ?? 0,
      };
    });
  });
}

export const listSourcesTool: CatalogTool<Record<string, never>> = {
  name: "list_sources",
  title: "List comic sources",
  description: "List configured comic sources with their latest crawl status and comic counts.",
  inputSchema: listSourcesInputJsonSchema,
  parse: parseListSourcesInput,
  execute: listSources,
};
