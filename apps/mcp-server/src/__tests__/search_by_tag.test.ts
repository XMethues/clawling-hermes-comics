import { afterEach, expect, test } from "bun:test";

import { searchByTag } from "../tools/searchByTag";
import {
  cleanupSqlite,
  insertComic,
  insertSource,
  insertSourceEntry,
  insertTag,
  migrateSqlite,
  openWritableSqlite,
  resetEnv,
  tmpSqlitePath,
} from "./setup";

afterEach(() => {
  resetEnv();
});

test("search_by_tag matches normalized tags case-insensitively", async () => {
  const dbFileName = tmpSqlitePath();
  migrateSqlite(dbFileName);
  const sqlite = openWritableSqlite(dbFileName);

  try {
    const sourceId = insertSource(sqlite, { key: "rouman5", name: "Rouman5" });
    const actionComicId = insertComic(sqlite, {
      name: "Action Comic",
      normalizedName: "action-comic",
      lastSourceId: sourceId,
    });
    const upperActionComicId = insertComic(sqlite, {
      name: "Upper Action Comic",
      normalizedName: "upper-action-comic",
      lastSourceId: sourceId,
    });
    const dramaComicId = insertComic(sqlite, {
      name: "Drama Comic",
      normalizedName: "drama-comic",
      lastSourceId: sourceId,
    });

    insertSourceEntry(sqlite, {
      comicId: actionComicId,
      sourceId,
      sourceComicKey: "action",
      viewCount: 10,
    });
    insertSourceEntry(sqlite, {
      comicId: upperActionComicId,
      sourceId,
      sourceComicKey: "upper-action",
      viewCount: 20,
    });
    insertSourceEntry(sqlite, {
      comicId: dramaComicId,
      sourceId,
      sourceComicKey: "drama",
      viewCount: 30,
    });

    insertTag(sqlite, actionComicId, "Action", "action");
    insertTag(sqlite, upperActionComicId, "ACTION", "ACTION");
    insertTag(sqlite, dramaComicId, "Drama", "drama");
  } finally {
    sqlite.close();
  }

  try {
    const result = await searchByTag({ tag: "aCtIoN", limit: 20, offset: 0 }, { dbFileName });

    expect(result.total).toBe(2);
    expect(result.items.map((comic) => comic.name)).toEqual(["Action Comic", "Upper Action Comic"]);
    expect(result.items.map((comic) => comic.sourceKey)).toEqual(["rouman5", "rouman5"]);
  } finally {
    cleanupSqlite(dbFileName);
  }
});
