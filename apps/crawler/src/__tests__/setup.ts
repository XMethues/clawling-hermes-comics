import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const setupDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(setupDir, "../../../..");
const migrationPath = join(projectRoot, "packages/db/drizzle/0000_initial_comic_catalog.sql");
const originalEnv = { ...process.env };
let browserReady: Promise<void> | undefined;

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
}

export function tmpSqlitePath(): string {
  return join(tmpdir(), `crawler-test-${randomUUID()}.sqlite`);
}

export function cleanupSqlite(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${path}${suffix}`;

    if (existsSync(target)) {
      unlinkSync(target);
    }
  }
}

export function migrateSqlite(path: string): void {
  const sqlite = new Database(path, { create: true });

  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec(readFileSync(migrationPath, "utf8"));
  } finally {
    sqlite.close();
  }
}

export function latestCrawlRun(path: string): {
  id: number;
  status: string;
  pagesSucceeded: number;
  comicsStored: number;
  chaptersStored: number;
  finishedAt: string | null;
} {
  const sqlite = new Database(path, { readonly: true });

  try {
    const row = sqlite
      .query(
        `select id,
                status,
                pages_succeeded as pagesSucceeded,
                comics_stored as comicsStored,
                chapters_stored as chaptersStored,
                finished_at as finishedAt
         from crawl_runs
         order by id desc
         limit 1`,
      )
      .get() as {
      id: number;
      status: string;
      pagesSucceeded: number;
      comicsStored: number;
      chaptersStored: number;
      finishedAt: string | null;
    } | null;

    if (!row) {
      throw new Error("Expected at least one crawl_runs row.");
    }

    return row;
  } finally {
    sqlite.close();
  }
}

export function countSourceEntriesForRun(path: string, crawlRunId: number): number {
  const sqlite = new Database(path, { readonly: true });

  try {
    const row = sqlite
      .query("select count(*) as count from comic_source_entries where last_crawl_run_id = ?")
      .get(crawlRunId) as { count: number };

    return Number(row.count);
  } finally {
    sqlite.close();
  }
}

export function makeForbiddenStorageDir(): { storageDir: string; cleanup: () => void } {
  const parent = mkdtempSync(join(tmpdir(), "crawler-no-access-"));
  chmodSync(parent, 0o000);

  return {
    storageDir: join(parent, "storage"),
    cleanup: () => {
      chmodSync(parent, 0o700);
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

export async function runCommand(
  command: string[],
  opts: { env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<CommandResult> {
  const startedAtMs = Date.now();
  const child = Bun.spawn(command, {
    cwd: projectRoot,
    env: { ...process.env, ...opts.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  let forceKillTimeout: ReturnType<typeof setTimeout> | undefined;
  const timeout = opts.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
      }, opts.timeoutMs)
    : undefined;

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - startedAtMs,
      timedOut,
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }

    if (forceKillTimeout) {
      clearTimeout(forceKillTimeout);
    }
  }
}

export async function waitForBrowser(): Promise<void> {
  browserReady ??= (async () => {
    const result = await runCommand(
      ["bun", "run", "--filter", "@comics/crawler", "browser:install"],
      { timeoutMs: 180_000 },
    );

    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(
        `browser:install failed with exit ${result.exitCode}; stdout=${result.stdout}; stderr=${result.stderr}`,
      );
    }
  })();

  await browserReady;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 2;
  const delayMs = opts.delayMs ?? 5_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      await Bun.sleep(delayMs);
    }
  }

  throw lastError;
}
