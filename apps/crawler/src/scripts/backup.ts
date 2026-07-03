import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { getDbEnv } from "@comics/db";

function nowIso(): string {
  return new Date().toISOString();
}

function timestampForFile(value = new Date()): string {
  return value.toISOString().replace(/[:.]/gu, "-");
}

function envString(name: string, defaultValue: string): string {
  const value = process.env[name]?.trim();

  return value ? value : defaultValue;
}

function projectRoot(): string {
  let current = process.cwd();

  while (true) {
    const packageJsonPath = join(current, "package.json");

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        workspaces?: unknown;
      };

      if (packageJson.workspaces) {
        return current;
      }
    }

    const parent = dirname(current);

    if (parent === current) {
      throw new Error("Could not locate workspace root package.json.");
    }

    current = parent;
  }
}

function resolveFromRoot(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

function backupSqlite(dbFileName: string, backupDir: string): string[] {
  if (!existsSync(dbFileName)) {
    console.warn(`[backup] SQLite file does not exist yet; nothing to back up: ${dbFileName}`);
    return [];
  }

  mkdirSync(backupDir, { recursive: true });

  const stamp = timestampForFile();
  const copied: string[] = [];

  for (const suffix of ["", "-wal", "-shm"]) {
    const source = `${dbFileName}${suffix}`;

    if (!existsSync(source)) {
      continue;
    }

    const target = join(backupDir, `${stamp}-${basename(source)}`);
    copyFileSync(source, target);
    copied.push(target);
  }

  return copied;
}

const root = projectRoot();
const dbEnv = getDbEnv();
const dbFileName = resolveFromRoot(root, dbEnv.fileName);
const backupDir = resolveFromRoot(root, envString("PRODUCTION_CRAWLER_BACKUP_DIR", "data/backups"));
const copied = backupSqlite(dbFileName, backupDir);

console.info(
  JSON.stringify(
    {
      status: "succeeded",
      generatedAt: nowIso(),
      dbFileName,
      backupDir,
      files: copied,
    },
    null,
    2,
  ),
);
