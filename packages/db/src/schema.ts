import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const comicSources = sqliteTable(
  "comic_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("comic_sources_key_uq").on(table.key)],
);

export const crawlRuns = sqliteTable(
  "crawl_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => comicSources.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["probe", "full"] }).notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
    startUrls: text("start_urls", { mode: "json" }).$type<string[]>().notNull(),
    requestQueueName: text("request_queue_name"),
    datasetName: text("dataset_name"),
    pagesSucceeded: integer("pages_succeeded").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    comicsStored: integer("comics_stored").notNull().default(0),
    chaptersStored: integer("chapters_stored").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("crawl_runs_source_id_idx").on(table.sourceId),
    index("crawl_runs_status_idx").on(table.status),
    index("crawl_runs_source_mode_id_idx").on(table.sourceId, table.mode, table.id),
  ],
);

export const comics = sqliteTable(
  "comics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    normalizedName: text("normalized_name").notNull(),
    name: text("name").notNull(),
    mainImageUrl: text("main_image_url"),
    intro: text("intro"),
    lastSourceId: integer("last_source_id").references(() => comicSources.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("comics_normalized_name_uq").on(table.normalizedName),
    index("comics_last_source_id_idx").on(table.lastSourceId),
  ],
);

export const comicSourceEntries = sqliteTable(
  "comic_source_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comicId: integer("comic_id")
      .notNull()
      .references(() => comics.id, { onDelete: "cascade" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => comicSources.id, { onDelete: "cascade" }),
    sourceComicKey: text("source_comic_key").notNull(),
    sourceUrl: text("source_url").notNull(),
    viewCount: integer("view_count"),
    serializationStatus: text("serialization_status", {
      enum: ["ongoing", "completed", "unknown"],
    })
      .notNull()
      .default("unknown"),
    lastCrawlRunId: integer("last_crawl_run_id").references(() => crawlRuns.id, {
      onDelete: "set null",
    }),
    lastCrawledAt: text("last_crawled_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("comic_source_entries_source_key_uq").on(table.sourceId, table.sourceComicKey),
    uniqueIndex("comic_source_entries_source_url_uq").on(table.sourceId, table.sourceUrl),
    index("comic_source_entries_comic_id_idx").on(table.comicId),
    index("comic_source_entries_source_id_idx").on(table.sourceId),
    index("comic_source_entries_last_crawl_run_id_idx").on(table.lastCrawlRunId),
    index("comic_source_entries_source_status_idx").on(table.sourceId, table.serializationStatus),
    index("comic_source_entries_source_view_count_idx").on(table.sourceId, table.viewCount),
  ],
);

export const comicTags = sqliteTable(
  "comic_tags",
  {
    comicId: integer("comic_id")
      .notNull()
      .references(() => comics.id, { onDelete: "cascade" }),
    normalizedTag: text("normalized_tag").notNull(),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.comicId, table.normalizedTag] }),
    index("comic_tags_normalized_tag_idx").on(table.normalizedTag),
  ],
);

export const comicChapters = sqliteTable(
  "comic_chapters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceEntryId: integer("source_entry_id")
      .notNull()
      .references(() => comicSourceEntries.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title"),
    url: text("url").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("comic_chapters_source_entry_url_uq").on(table.sourceEntryId, table.url),
    index("comic_chapters_source_entry_position_idx").on(table.sourceEntryId, table.position),
  ],
);

export const schema = {
  comicSources,
  crawlRuns,
  comics,
  comicSourceEntries,
  comicTags,
  comicChapters,
};

export type DbSchema = typeof schema;

export type ComicSource = typeof comicSources.$inferSelect;
export type NewComicSource = typeof comicSources.$inferInsert;
export type CrawlRun = typeof crawlRuns.$inferSelect;
export type NewCrawlRun = typeof crawlRuns.$inferInsert;
export type Comic = typeof comics.$inferSelect;
export type NewComic = typeof comics.$inferInsert;
export type ComicSourceEntry = typeof comicSourceEntries.$inferSelect;
export type NewComicSourceEntry = typeof comicSourceEntries.$inferInsert;
export type ComicTag = typeof comicTags.$inferSelect;
export type NewComicTag = typeof comicTags.$inferInsert;
export type ComicChapter = typeof comicChapters.$inferSelect;
export type NewComicChapter = typeof comicChapters.$inferInsert;
