import { afterEach, expect, test } from "bun:test";

import { listSources } from "../tools/listSources";
import {
  cleanupSqlite,
  insertComic,
  insertCrawlRun,
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

test("list_sources returns every source with latest crawl status and comic count", async () => {
  const dbFileName = tmpSqlitePath();
  migrateSqlite(dbFileName);
  const sqlite = openWritableSqlite(dbFileName);

  try {
    const rouman5Id = insertSource(sqlite, {
      key: "rouman5",
      name: "Rouman5",
      baseUrl: "https://rouman5.com",
    });
    const eighteenComicId = insertSource(sqlite, {
      key: "18comic",
      name: "18comic",
      baseUrl: "https://18comic.vip",
    });

    insertCrawlRun(sqlite, {
      sourceId: rouman5Id,
      status: "failed",
      startedAt: "2026-07-02T06:00:00Z",
    });
    insertCrawlRun(sqlite, {
      sourceId: rouman5Id,
      status: "succeeded",
      startedAt: "2026-07-02T07:18:08Z",
    });
    insertCrawlRun(sqlite, {
      sourceId: eighteenComicId,
      status: "succeeded",
      startedAt: "2026-07-02T05:00:00Z",
    });
    insertCrawlRun(sqlite, {
      sourceId: eighteenComicId,
      status: "failed",
      startedAt: "2026-07-02T07:20:30Z",
    });

    for (let index = 0; index < 3; index += 1) {
      const comicId = insertComic(sqlite, {
        name: `Rouman5 Comic ${index}`,
        lastSourceId: rouman5Id,
      });
      insertSourceEntry(sqlite, {
        comicId,
        sourceId: rouman5Id,
        sourceComicKey: `rouman5-${index}`,
      });
    }

    const eighteenComicComicId = insertComic(sqlite, {
      name: "18comic Comic",
      lastSourceId: eighteenComicId,
    });
    insertSourceEntry(sqlite, {
      comicId: eighteenComicComicId,
      sourceId: eighteenComicId,
      sourceComicKey: "18comic-1",
    });
  } finally {
    sqlite.close();
  }

  try {
    const result = await listSources({}, { dbFileName });

    expect(result).toHaveLength(2);
    expect(result.find((source) => source.key === "rouman5")).toMatchObject({
      name: "Rouman5",
      baseUrl: "https://rouman5.com",
      latestRunStatus: "succeeded",
      latestRunAt: "2026-07-02T07:18:08Z",
      comicCount: 3,
    });
    expect(result.find((source) => source.key === "18comic")).toMatchObject({
      latestRunStatus: "failed",
      latestRunAt: "2026-07-02T07:20:30Z",
      comicCount: 1,
    });
  } finally {
    cleanupSqlite(dbFileName);
  }
});
