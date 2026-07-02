import { comicChapters, comicSourceEntries, comicSources, comics, comicTags } from "@comics/db";
import { asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import type { CatalogQueryOptions, ListComicsInput, ListComicsResult } from "../types";
import {
  type CatalogTool,
  invalidRequest,
  paginationJsonSchema,
  parseInput,
  withCatalogDb,
} from "./common";

const listComicsInputSchema = z
  .object({
    sourceKey: z.string().trim().min(1),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

export const listComicsInputJsonSchema = {
  type: "object",
  properties: {
    sourceKey: {
      type: "string",
      minLength: 1,
      description: "Comic source key, for example rouman5 or 18comic.",
    },
    ...paginationJsonSchema,
  },
  required: ["sourceKey"],
  additionalProperties: false,
} satisfies import("@modelcontextprotocol/server").Tool["inputSchema"];

export function parseListComicsInput(input: unknown): ListComicsInput {
  return parseInput(listComicsInputSchema, input, "list_comics");
}

export async function listComics(
  input: ListComicsInput,
  options?: CatalogQueryOptions,
): Promise<ListComicsResult> {
  return withCatalogDb(options, (db) => {
    const source = db
      .select({ id: comicSources.id })
      .from(comicSources)
      .where(eq(comicSources.key, input.sourceKey))
      .get();

    if (!source) {
      throw invalidRequest(`Comic source '${input.sourceKey}' was not found.`);
    }

    const total = db
      .select({ count: count() })
      .from(comicSourceEntries)
      .where(eq(comicSourceEntries.sourceId, source.id))
      .get();

    const rows = db
      .select({
        sourceEntryId: comicSourceEntries.id,
        comicId: comics.id,
        name: comics.name,
        sourceUrl: comicSourceEntries.sourceUrl,
        viewCount: comicSourceEntries.viewCount,
        serializationStatus: comicSourceEntries.serializationStatus,
        lastCrawledAt: comicSourceEntries.lastCrawledAt,
      })
      .from(comicSourceEntries)
      .innerJoin(comics, eq(comicSourceEntries.comicId, comics.id))
      .where(eq(comicSourceEntries.sourceId, source.id))
      .orderBy(asc(comics.id), asc(comicSourceEntries.id))
      .limit(input.limit)
      .offset(input.offset)
      .all();

    const comicIds = rows.map((row) => row.comicId);
    const sourceEntryIds = rows.map((row) => row.sourceEntryId);
    const tagsByComicId = new Map<number, string[]>();
    const chapterCountsBySourceEntryId = new Map<number, number>();

    if (comicIds.length > 0) {
      const tagRows = db
        .select({ comicId: comicTags.comicId, tag: comicTags.tag })
        .from(comicTags)
        .where(inArray(comicTags.comicId, comicIds))
        .orderBy(asc(comicTags.normalizedTag))
        .all();

      for (const row of tagRows) {
        const tags = tagsByComicId.get(row.comicId) ?? [];
        tags.push(row.tag);
        tagsByComicId.set(row.comicId, tags);
      }

      const chapterCountRows = db
        .select({ sourceEntryId: comicChapters.sourceEntryId, count: count() })
        .from(comicChapters)
        .where(inArray(comicChapters.sourceEntryId, sourceEntryIds))
        .groupBy(comicChapters.sourceEntryId)
        .all();

      for (const row of chapterCountRows) {
        chapterCountsBySourceEntryId.set(row.sourceEntryId, Number(row.count));
      }
    }

    return {
      total: Number(total?.count ?? 0),
      items: rows.map((row) => ({
        id: row.comicId,
        name: row.name,
        sourceUrl: row.sourceUrl,
        viewCount: row.viewCount,
        serializationStatus: row.serializationStatus,
        tags: tagsByComicId.get(row.comicId) ?? [],
        chapterCount: chapterCountsBySourceEntryId.get(row.sourceEntryId) ?? 0,
        lastCrawledAt: row.lastCrawledAt,
      })),
    };
  });
}

export const listComicsTool: CatalogTool<ListComicsInput> = {
  name: "list_comics",
  title: "List comics by source",
  description: "Page through comics stored for one source, including tags and chapter counts.",
  inputSchema: listComicsInputJsonSchema,
  parse: parseListComicsInput,
  execute: listComics,
};
