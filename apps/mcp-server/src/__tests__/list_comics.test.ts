import { afterEach, expect, test } from "bun:test";

import { listComics } from "../tools/listComics";
import {
  cleanupSqlite,
  insertChapter,
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

test("list_comics pages source comics with total count", async () => {
  const dbFileName = tmpSqlitePath();
  migrateSqlite(dbFileName);
  const sqlite = openWritableSqlite(dbFileName);

  try {
    const sourceId = insertSource(sqlite, { key: "rouman5", name: "Rouman5" });

    for (let index = 0; index < 5; index += 1) {
      const comicId = insertComic(sqlite, {
        name: `Comic ${index}`,
        normalizedName: `comic-${index}`,
        lastSourceId: sourceId,
      });
      const sourceEntryId = insertSourceEntry(sqlite, {
        comicId,
        sourceId,
        sourceComicKey: `comic-${index}`,
        viewCount: index * 10,
      });
      insertTag(sqlite, comicId, "Action");
      insertChapter(sqlite, sourceEntryId, 1);
    }
  } finally {
    sqlite.close();
  }

  try {
    const firstPage = await listComics(
      { sourceKey: "rouman5", limit: 2, offset: 0 },
      { dbFileName },
    );
    const secondPage = await listComics(
      { sourceKey: "rouman5", limit: 2, offset: 2 },
      { dbFileName },
    );

    expect(firstPage.total).toBe(5);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items.map((comic) => comic.name)).toEqual(["Comic 0", "Comic 1"]);
    expect(firstPage.items[0]).toMatchObject({
      tags: ["Action"],
      chapterCount: 1,
    });

    expect(secondPage.total).toBe(5);
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.items.map((comic) => comic.name)).toEqual(["Comic 2", "Comic 3"]);
  } finally {
    cleanupSqlite(dbFileName);
  }
});
