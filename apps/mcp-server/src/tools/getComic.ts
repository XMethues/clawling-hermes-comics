import { comicChapters, comicSourceEntries, comicSources, comics } from "@comics/db";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import type { CatalogQueryOptions, GetComicInput, GetComicResult } from "../types";
import { type CatalogTool, invalidRequest, parseInput, withCatalogDb } from "./common";

const getComicInputSchema = z
  .object({
    comicId: z.number().int().positive(),
  })
  .strict();

export const getComicInputJsonSchema = {
  type: "object",
  properties: {
    comicId: {
      type: "integer",
      minimum: 1,
      description: "Numeric comics.id value.",
    },
  },
  required: ["comicId"],
  additionalProperties: false,
} satisfies import("@modelcontextprotocol/server").Tool["inputSchema"];

export function parseGetComicInput(input: unknown): GetComicInput {
  return parseInput(getComicInputSchema, input, "get_comic");
}

export async function getComic(
  input: GetComicInput,
  options?: CatalogQueryOptions,
): Promise<GetComicResult> {
  return withCatalogDb(options, (db) => {
    const comic = db
      .select({
        id: comics.id,
        name: comics.name,
        mainImageUrl: comics.mainImageUrl,
        intro: comics.intro,
      })
      .from(comics)
      .where(eq(comics.id, input.comicId))
      .get();

    if (!comic) {
      throw invalidRequest(`Comic ${input.comicId} was not found.`);
    }

    const sourceRows = db
      .select({
        sourceEntryId: comicSourceEntries.id,
        sourceKey: comicSources.key,
        sourceUrl: comicSourceEntries.sourceUrl,
        viewCount: comicSourceEntries.viewCount,
        serializationStatus: comicSourceEntries.serializationStatus,
      })
      .from(comicSourceEntries)
      .innerJoin(comicSources, eq(comicSourceEntries.sourceId, comicSources.id))
      .where(eq(comicSourceEntries.comicId, comic.id))
      .orderBy(asc(comicSources.key), asc(comicSourceEntries.id))
      .all();

    const sourceEntryIds = sourceRows.map((row) => row.sourceEntryId);
    const chaptersBySourceEntryId = new Map<
      number,
      GetComicResult["sources"][number]["chapters"]
    >();

    if (sourceEntryIds.length > 0) {
      const chapterRows = db
        .select({
          sourceEntryId: comicChapters.sourceEntryId,
          position: comicChapters.position,
          title: comicChapters.title,
          url: comicChapters.url,
        })
        .from(comicChapters)
        .where(inArray(comicChapters.sourceEntryId, sourceEntryIds))
        .orderBy(
          asc(comicChapters.sourceEntryId),
          asc(comicChapters.position),
          asc(comicChapters.id),
        )
        .all();

      for (const row of chapterRows) {
        const chapters = chaptersBySourceEntryId.get(row.sourceEntryId) ?? [];
        chapters.push({
          position: row.position,
          title: row.title,
          url: row.url,
        });
        chaptersBySourceEntryId.set(row.sourceEntryId, chapters);
      }
    }

    return {
      id: comic.id,
      name: comic.name,
      mainImageUrl: comic.mainImageUrl,
      intro: comic.intro,
      sources: sourceRows.map((row) => ({
        sourceKey: row.sourceKey,
        sourceUrl: row.sourceUrl,
        viewCount: row.viewCount,
        serializationStatus: row.serializationStatus,
        chapters: chaptersBySourceEntryId.get(row.sourceEntryId) ?? [],
      })),
    };
  });
}

export const getComicTool: CatalogTool<GetComicInput> = {
  name: "get_comic",
  title: "Get comic details",
  description: "Return one comic with source entries and sorted chapters.",
  inputSchema: getComicInputJsonSchema,
  parse: parseGetComicInput,
  execute: getComic,
};
