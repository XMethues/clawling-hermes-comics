import { afterEach, expect, test } from "bun:test";

import { getLatestCrawlRun } from "../tools/getLatestCrawlRun";
import {
  cleanupSqlite,
  insertCrawlRun,
  insertSource,
  migrateSqlite,
  openWritableSqlite,
  resetEnv,
  tmpSqlitePath,
} from "./setup";

afterEach(() => {
  resetEnv();
});

test("get_latest_crawl_run returns one newest run per source", async () => {
  const dbFileName = tmpSqlitePath();
  migrateSqlite(dbFileName);
  const sqlite = openWritableSqlite(dbFileName);

  try {
    const rouman5Id = insertSource(sqlite, { key: "rouman5", name: "Rouman5" });
    const eighteenComicId = insertSource(sqlite, { key: "18comic", name: "18comic" });

    insertCrawlRun(sqlite, {
      sourceId: rouman5Id,
      status: "failed",
      startedAt: "2026-07-02T01:00:00Z",
      errorMessage: "old error",
    });
    insertCrawlRun(sqlite, {
      sourceId: rouman5Id,
      mode: "full",
      status: "succeeded",
      startedAt: "2026-07-02T02:00:00Z",
      finishedAt: "2026-07-02T02:30:00Z",
      pagesSucceeded: 2,
      comicsStored: 3,
      chaptersStored: 4,
    });
    insertCrawlRun(sqlite, {
      sourceId: eighteenComicId,
      status: "succeeded",
      startedAt: "2026-07-02T03:00:00Z",
    });
    insertCrawlRun(sqlite, {
      sourceId: eighteenComicId,
      status: "failed",
      startedAt: "2026-07-02T04:00:00Z",
      pagesFailed: 1,
      errorMessage: "latest failure",
    });
  } finally {
    sqlite.close();
  }

  try {
    const result = await getLatestCrawlRun({}, { dbFileName });

    expect(result).toHaveLength(2);
    expect(result.find((run) => run.sourceKey === "rouman5")).toMatchObject({
      mode: "full",
      status: "succeeded",
      startedAt: "2026-07-02T02:00:00Z",
      pagesSucceeded: 2,
      comicsStored: 3,
      chaptersStored: 4,
    });
    expect(result.find((run) => run.sourceKey === "18comic")).toMatchObject({
      status: "failed",
      startedAt: "2026-07-02T04:00:00Z",
      pagesFailed: 1,
      errorMessage: "latest failure",
    });

    const rouman5Only = await getLatestCrawlRun({ sourceKey: "rouman5" }, { dbFileName });
    expect(rouman5Only).toHaveLength(1);
    expect(rouman5Only[0]?.sourceKey).toBe("rouman5");
  } finally {
    cleanupSqlite(dbFileName);
  }
});
