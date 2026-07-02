import { comicSourceEntries, comicSources, comics, comicTags } from "@comics/db";
import { asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import type { CatalogQueryOptions, SearchByTagInput, SearchByTagResult } from "../types";
import { type CatalogTool, paginationJsonSchema, parseInput, withCatalogDb } from "./common";

const searchByTagInputSchema = z
  .object({
    tag: z.string().trim().min(1),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

export const searchByTagInputJsonSchema = {
  type: "object",
  properties: {
    tag: {
      type: "string",
      minLength: 1,
      description: "Tag to match against comic_tags.normalized_tag case-insensitively.",
    },
    ...paginationJsonSchema,
  },
  required: ["tag"],
  additionalProperties: false,
} satisfies import("@modelcontextprotocol/server").Tool["inputSchema"];

export function parseSearchByTagInput(input: unknown): SearchByTagInput {
  return parseInput(searchByTagInputSchema, input, "search_by_tag");
}

export async function searchByTag(
  input: SearchByTagInput,
  options?: CatalogQueryOptions,
): Promise<SearchByTagResult> {
  const normalizedTag = input.tag.toLowerCase();

  return withCatalogDb(options, (db) => {
    const tagPredicate = sql`lower(${comicTags.normalizedTag}) = ${normalizedTag}`;
    const total = db
      .select({ count: count() })
      .from(comicTags)
      .innerJoin(comics, eq(comicTags.comicId, comics.id))
      .innerJoin(comicSourceEntries, eq(comicSourceEntries.comicId, comics.id))
      .innerJoin(comicSources, eq(comicSourceEntries.sourceId, comicSources.id))
      .where(tagPredicate)
      .get();

    const rows = db
      .select({
        id: comics.id,
        name: comics.name,
        sourceKey: comicSources.key,
        viewCount: comicSourceEntries.viewCount,
      })
      .from(comicTags)
      .innerJoin(comics, eq(comicTags.comicId, comics.id))
      .innerJoin(comicSourceEntries, eq(comicSourceEntries.comicId, comics.id))
      .innerJoin(comicSources, eq(comicSourceEntries.sourceId, comicSources.id))
      .where(tagPredicate)
      .orderBy(asc(comics.id), asc(comicSources.key), asc(comicSourceEntries.id))
      .limit(input.limit)
      .offset(input.offset)
      .all();

    return {
      total: Number(total?.count ?? 0),
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        sourceKey: row.sourceKey,
        viewCount: row.viewCount,
      })),
    };
  });
}

export const searchByTagTool: CatalogTool<SearchByTagInput> = {
  name: "search_by_tag",
  title: "Search comics by tag",
  description: "Find comics with a normalized tag, matching case-insensitively.",
  inputSchema: searchByTagInputJsonSchema,
  parse: parseSearchByTagInput,
  execute: searchByTag,
};
