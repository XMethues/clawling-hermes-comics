import { afterEach, expect, test } from "bun:test";

import { getComic } from "../tools/getComic";
import {
  cleanupSqlite,
  insertChapter,
  insertComic,
  insertSource,
  insertSourceEntry,
  migrateSqlite,
  openWritableSqlite,
  resetEnv,
  tmpSqlitePath,
} from "./setup";

afterEach(() => {
  resetEnv();
});

test("get_comic returns chapters sorted by position", async () => {
  const dbFileName = tmpSqlitePath();
  migrateSqlite(dbFileName);
  const sqlite = openWritableSqlite(dbFileName);
  let comicId = 0;

  try {
    const sourceId = insertSource(sqlite, { key: "rouman5", name: "Rouman5" });
    comicId = insertComic(sqlite, {
      name: "Sorted Chapters Comic",
      mainImageUrl: "https://img.example/comic.jpg",
      intro: "Intro text",
      lastSourceId: sourceId,
    });
    const sourceEntryId = insertSourceEntry(sqlite, {
      comicId,
      sourceId,
      sourceComicKey: "sorted-chapters",
      serializationStatus: "ongoing",
    });

    insertChapter(sqlite, sourceEntryId, 3, "Third");
    insertChapter(sqlite, sourceEntryId, 1, "First");
    insertChapter(sqlite, sourceEntryId, 2, "Second");
  } finally {
    sqlite.close();
  }

  try {
    const result = await getComic({ comicId }, { dbFileName });

    expect(result).toMatchObject({
      id: comicId,
      name: "Sorted Chapters Comic",
      mainImageUrl: "https://img.example/comic.jpg",
      intro: "Intro text",
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.chapters.map((chapter) => chapter.position)).toEqual([1, 2, 3]);
    expect(result.sources[0]?.chapters.map((chapter) => chapter.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  } finally {
    cleanupSqlite(dbFileName);
  }
});
