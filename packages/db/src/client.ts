import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { drizzle } from "drizzle-orm/bun-sqlite";

import { getDbEnv } from "./env";
import { schema } from "./schema";

export interface CreateDbOptions {
  fileName?: string;
  sqlite?: Database;
}

export function createSqliteDatabase(fileName = getDbEnv().fileName): Database {
  mkdirSync(dirname(fileName), { recursive: true });

  return new Database(fileName, { create: true });
}

export function createDb(options: CreateDbOptions = {}) {
  const sqlite = options.sqlite ?? createSqliteDatabase(options.fileName);

  return drizzle(sqlite, { schema });
}

export type ComicsDb = ReturnType<typeof createDb>;

export function closeSqliteDatabase(sqlite: Database): void {
  sqlite.close();
}
