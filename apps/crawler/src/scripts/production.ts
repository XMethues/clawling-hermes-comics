import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { closeSqliteDatabase, createSqliteDatabase, getDbEnv } from "@comics/db";

import {
  type ComicQualityStats,
  createEmptyQualityStats,
  envPositiveInteger,
} from "../qualityGates";
import { eighteenComicHanmanSite } from "../sites/18comic";
import { rouman5Site } from "../sites/rouman5";
import type { ComicCrawlerMode, ComicCrawlSummary } from "../types";

type ProductionCommand = "run" | "probe-only";
type ProductionStatus = "succeeded" | "failed";
type SiteId = "rouman5" | "18comic";
type QualitySeverity = "warning" | "failure";

interface SiteRunnerConfig {
  id: SiteId;
  label: string;
  site: typeof rouman5Site;
  probeScript: string;
  fullScript: string;
  probeMaxRequestsEnv: string;
  probeMaxRequestsDefault: number;
  fullMaxRequestsEnv: string;
  fullMaxRequestsDefault: number;
  maxConcurrencyEnv: string;
  maxConcurrencyDefault: number;
  sameDomainDelaySecsEnv: string;
  sameDomainDelaySecsDefault: number;
  probeMaxRuntimeSecsEnv: string;
  probeMaxRuntimeSecsDefault: number;
  fullMaxRuntimeSecsEnv: string;
  fullMaxRuntimeSecsDefault: number;
  minProbeComicsEnv: string;
  minFullComicsEnv: string;
}

interface QualityFinding {
  severity: QualitySeverity;
  site: SiteId;
  mode: ComicCrawlerMode;
  message: string;
}

interface RunRecord {
  site: SiteId;
  mode: ComicCrawlerMode;
  summary: ComicCrawlSummary;
  quality: ComicQualityStats;
  findings: QualityFinding[];
  durationMs?: number;
}

interface ProductionSummary {
  status: ProductionStatus;
  command: ProductionCommand;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  dbFileName: string;
  backupFiles: string[];
  staleRunningRunsMarkedFailed: number;
  runs: RunRecord[];
  findings: QualityFinding[];
  errorMessage?: string;
}

interface ProductionSummaryFile {
  schemaVersion: 1;
  generatedAt: string;
  overallStatus: ProductionStatus;
  records: Array<{
    site: SiteId;
    mode: ComicCrawlerMode;
    status: ProductionStatus;
    crawlRunId: number;
    comicsStored: number;
    chaptersStored: number;
    failedRequests: number;
    errorMessage?: string;
    durationMs?: number;
  }>;
}

const SITE_RUNNERS: SiteRunnerConfig[] = [
  {
    id: "rouman5",
    label: "Rouman5",
    site: rouman5Site,
    probeScript: "rouman5:probe",
    fullScript: "rouman5:crawl",
    probeMaxRequestsEnv: "ROUMAN5_PROBE_MAX_REQUESTS",
    probeMaxRequestsDefault: 20,
    fullMaxRequestsEnv: "ROUMAN5_MAX_REQUESTS",
    fullMaxRequestsDefault: 10_000,
    maxConcurrencyEnv: "ROUMAN5_MAX_CONCURRENCY",
    maxConcurrencyDefault: 1,
    sameDomainDelaySecsEnv: "ROUMAN5_SAME_DOMAIN_DELAY_SECS",
    sameDomainDelaySecsDefault: 2,
    probeMaxRuntimeSecsEnv: "ROUMAN5_PROBE_MAX_RUNTIME_SECS",
    probeMaxRuntimeSecsDefault: 300,
    fullMaxRuntimeSecsEnv: "ROUMAN5_MAX_RUNTIME_SECS",
    fullMaxRuntimeSecsDefault: 14_400,
    minProbeComicsEnv: "ROUMAN5_MIN_PROBE_COMICS",
    minFullComicsEnv: "ROUMAN5_MIN_FULL_COMICS",
  },
  {
    id: "18comic",
    label: "18comic Hanman",
    site: eighteenComicHanmanSite,
    probeScript: "18comic:probe",
    fullScript: "18comic:hanman",
    probeMaxRequestsEnv: "EIGHTEEN_COMIC_PROBE_MAX_REQUESTS",
    probeMaxRequestsDefault: 6,
    fullMaxRequestsEnv: "EIGHTEEN_COMIC_HANMAN_MAX_REQUESTS",
    fullMaxRequestsDefault: 3_000,
    maxConcurrencyEnv: "EIGHTEEN_COMIC_MAX_CONCURRENCY",
    maxConcurrencyDefault: 1,
    sameDomainDelaySecsEnv: "EIGHTEEN_COMIC_SAME_DOMAIN_DELAY_SECS",
    sameDomainDelaySecsDefault: 3,
    probeMaxRuntimeSecsEnv: "EIGHTEEN_COMIC_PROBE_MAX_RUNTIME_SECS",
    probeMaxRuntimeSecsDefault: 300,
    fullMaxRuntimeSecsEnv: "EIGHTEEN_COMIC_HANMAN_MAX_RUNTIME_SECS",
    fullMaxRuntimeSecsDefault: 21_600,
    minProbeComicsEnv: "EIGHTEEN_COMIC_MIN_PROBE_COMICS",
    minFullComicsEnv: "EIGHTEEN_COMIC_HANMAN_MIN_FULL_COMICS",
  },
];

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

function envOptionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

function envBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  throw new Error(`${name} must be a boolean value.`);
}

function parseCommand(value: string | undefined): ProductionCommand {
  if (!value || value === "run") {
    return "run";
  }

  if (["probe", "probe-only", "dry-run"].includes(value)) {
    return "probe-only";
  }

  throw new Error("Usage: bun src/scripts/production.ts <run|probe-only>");
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
  return resolve(root, path);
}

function selectedSites(): SiteRunnerConfig[] {
  const configured = envString("PRODUCTION_CRAWLER_SITES", "rouman5,18comic")
    .split(",")
    .map((site) => site.trim())
    .filter(Boolean);

  const selected = SITE_RUNNERS.filter((site) => configured.includes(site.id));

  if (selected.length === 0) {
    throw new Error(
      `PRODUCTION_CRAWLER_SITES did not select any supported site. Supported: ${SITE_RUNNERS.map((site) => site.id).join(", ")}`,
    );
  }

  const unsupported = configured.filter(
    (site) => !SITE_RUNNERS.some((runner) => runner.id === site),
  );

  if (unsupported.length > 0) {
    throw new Error(`Unsupported PRODUCTION_CRAWLER_SITES value(s): ${unsupported.join(", ")}`);
  }

  return selected;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(lockFile: string): () => void {
  mkdirSync(dirname(lockFile), { recursive: true });

  if (existsSync(lockFile)) {
    const lockContents = readFileSync(lockFile, "utf8");
    const pid = Number(lockContents.match(/pid=(\d+)/u)?.[1]);

    if (Number.isInteger(pid) && pid > 0 && isProcessRunning(pid)) {
      throw new Error(
        `Production crawler is already running under pid ${pid}; lock file: ${lockFile}`,
      );
    }

    rmSync(lockFile, { force: true });
  }

  const fd = openSync(lockFile, "wx");
  writeFileSync(fd, `pid=${process.pid}\nstarted_at=${nowIso()}\n`);
  closeSync(fd);

  return () => rmSync(lockFile, { force: true });
}

async function runWorkspaceCommand(
  root: string,
  command: string[],
  label: string,
  timeoutSecs?: number,
): Promise<void> {
  console.info(`[production] ${label}: ${command.join(" ")}`);

  const child = Bun.spawn(command, {
    cwd: root,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  let timedOut = false;
  let forceKillTimeout: ReturnType<typeof setTimeout> | undefined;
  const timeout = timeoutSecs
    ? setTimeout(() => {
        timedOut = true;
        console.error(`[production] ${label} exceeded ${timeoutSecs} second(s); terminating.`);
        child.kill("SIGTERM");
        forceKillTimeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
      }, timeoutSecs * 1_000)
    : undefined;

  try {
    const exitCode = await child.exited;

    if (timedOut) {
      throw new Error(`${label} exceeded max runtime of ${timeoutSecs} second(s).`);
    }

    if (exitCode !== 0) {
      throw new Error(`${label} failed with exit code ${exitCode}.`);
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }

    if (forceKillTimeout) {
      clearTimeout(forceKillTimeout);
    }
  }
}

async function runMigrations(root: string): Promise<void> {
  if (envBoolean("PRODUCTION_CRAWLER_SKIP_MIGRATE", false)) {
    console.info(
      "[production] Skipping DB migration because PRODUCTION_CRAWLER_SKIP_MIGRATE is true.",
    );
    return;
  }

  await runWorkspaceCommand(
    root,
    [process.execPath, "run", "--filter", "@comics/db", "db:migrate"],
    "db:migrate",
  );
}

async function ensureBrowser(root: string): Promise<void> {
  if (envBoolean("PRODUCTION_CRAWLER_SKIP_BROWSER_INSTALL", false)) {
    console.info(
      "[production] Skipping CloakBrowser install check because PRODUCTION_CRAWLER_SKIP_BROWSER_INSTALL is true.",
    );
    return;
  }

  await runWorkspaceCommand(
    root,
    [process.execPath, "run", "--filter", "@comics/crawler", "browser:install"],
    "browser:install",
  );
}

function backupSqliteDatabase(dbFileName: string, backupDir: string): string[] {
  if (envBoolean("PRODUCTION_CRAWLER_SKIP_BACKUP", false)) {
    console.info(
      "[production] Skipping SQLite backup because PRODUCTION_CRAWLER_SKIP_BACKUP is true.",
    );
    return [];
  }

  if (!existsSync(dbFileName)) {
    console.info(`[production] SQLite file does not exist yet; backup skipped: ${dbFileName}`);
    return [];
  }

  mkdirSync(backupDir, { recursive: true });

  const stamp = timestampForFile();
  const backupFiles: string[] = [];

  for (const suffix of ["", "-wal", "-shm"]) {
    const source = `${dbFileName}${suffix}`;

    if (!existsSync(source)) {
      continue;
    }

    const target = join(backupDir, `${stamp}-${source.split("/").at(-1)}`);
    copyFileSync(source, target);
    backupFiles.push(target);
  }

  console.info(`[production] Created ${backupFiles.length} SQLite backup file(s).`);

  return backupFiles;
}

function markStaleRunningRunsFailed(sqlite: ReturnType<typeof createSqliteDatabase>): number {
  // Startup/subprocess recovery only: clear stale running rows, never overwrite terminal runs.
  const rows = sqlite.query("select id from crawl_runs where status = 'running'").all();

  if (rows.length === 0) {
    return 0;
  }

  sqlite
    .query(
      "update crawl_runs set status = 'failed', error_message = ?, finished_at = ? where status = 'running'",
    )
    .run("Marked failed by production runner startup; prior process likely interrupted.", nowIso());

  console.warn(`[production] Marked ${rows.length} stale running crawl run(s) as failed.`);

  return rows.length;
}

function qualityStatsForRun(
  sqlite: ReturnType<typeof createSqliteDatabase>,
  crawlRunId: number,
): ComicQualityStats {
  const row = sqlite
    .query(
      `
select
  count(*) as total,
  sum(case when c.main_image_url is null or c.main_image_url = '' or c.main_image_url like '%blank.jpg%' then 1 else 0 end) as missingImages,
  sum(case when e.view_count is null then 1 else 0 end) as missingViewCounts,
  sum(case when e.serialization_status = 'unknown' then 1 else 0 end) as unknownStatuses,
  sum(case when (select count(1) from comic_chapters ch where ch.source_entry_id = e.id) = 0 then 1 else 0 end) as zeroChapterEntries
from comic_source_entries e
join comics c on c.id = e.comic_id
where e.last_crawl_run_id = ?
`,
    )
    .get(crawlRunId) as Partial<ComicQualityStats> | null;

  return {
    total: Number(row?.total ?? 0),
    missingImages: Number(row?.missingImages ?? 0),
    missingViewCounts: Number(row?.missingViewCounts ?? 0),
    unknownStatuses: Number(row?.unknownStatuses ?? 0),
    zeroChapterEntries: Number(row?.zeroChapterEntries ?? 0),
  };
}

function maxRuntimeSecsFor(site: SiteRunnerConfig, mode: ComicCrawlerMode): number {
  return mode === "probe"
    ? envPositiveInteger(site.probeMaxRuntimeSecsEnv, site.probeMaxRuntimeSecsDefault)
    : envPositiveInteger(site.fullMaxRuntimeSecsEnv, site.fullMaxRuntimeSecsDefault);
}

function scriptForMode(site: SiteRunnerConfig, mode: ComicCrawlerMode): string {
  return mode === "probe" ? site.probeScript : site.fullScript;
}

function latestRunId(
  sqlite: ReturnType<typeof createSqliteDatabase>,
  site: SiteRunnerConfig,
  mode: ComicCrawlerMode,
): number {
  const row = sqlite
    .query(
      `
select cr.id as id
from crawl_runs cr
join comic_sources cs on cs.id = cr.source_id
where cs.key = ? and cr.mode = ?
order by cr.id desc
limit 1
`,
    )
    .get(site.site.key, mode) as { id: number } | null;

  return Number(row?.id ?? 0);
}

function latestSummaryForRun(
  sqlite: ReturnType<typeof createSqliteDatabase>,
  site: SiteRunnerConfig,
  mode: ComicCrawlerMode,
  afterRunId = 0,
): ComicCrawlSummary {
  const row = sqlite
    .query(
      `
select
  cr.id as crawlRunId,
  cs.key as sourceKey,
  cr.request_queue_name as requestQueueName,
  cr.dataset_name as datasetName,
  cr.status as status,
  cr.pages_succeeded as succeeded,
  cr.pages_failed as failed,
  cr.comics_stored as comicsStored,
  (
    select count(*)
    from comic_source_entries e
    join comic_tags t on t.comic_id = e.comic_id
    where e.last_crawl_run_id = cr.id
  ) as tagsStored,
  cr.chapters_stored as chaptersStored,
  cr.error_message as errorMessage,
  cr.started_at as startedAt,
  cr.finished_at as finishedAt
from crawl_runs cr
join comic_sources cs on cs.id = cr.source_id
where cs.key = ? and cr.mode = ? and cr.id > ?
order by cr.id desc
limit 1
`,
    )
    .get(site.site.key, mode, afterRunId) as {
    crawlRunId: number;
    sourceKey: string;
    requestQueueName: string | null;
    datasetName: string | null;
    status: ProductionStatus;
    succeeded: number;
    failed: number;
    comicsStored: number;
    tagsStored: number;
    chaptersStored: number;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
  } | null;

  if (!row) {
    throw new Error(
      `Could not find latest ${site.id} ${mode} crawl run after subprocess completed.`,
    );
  }

  return {
    sourceKey: row.sourceKey,
    mode,
    crawlRunId: row.crawlRunId,
    requestQueueName: row.requestQueueName ?? "",
    datasetName: row.datasetName ?? undefined,
    status: row.status,
    total: row.succeeded + row.failed,
    succeeded: row.succeeded,
    failed: row.failed,
    comicsStored: row.comicsStored,
    tagsStored: row.tagsStored,
    chaptersStored: row.chaptersStored,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? "",
    errors: row.errorMessage
      ? [
          {
            sourceUrl: site.site.startUrls[mode].join(","),
            retryCount: 0,
            errorMessage: row.errorMessage,
          },
        ]
      : [],
  };
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failedRunRecord(
  site: SiteRunnerConfig,
  mode: ComicCrawlerMode,
  message: string,
  durationMs: number,
): RunRecord {
  const timestamp = nowIso();
  const finding: QualityFinding = {
    severity: "failure",
    site: site.id,
    mode,
    message,
  };

  return {
    site: site.id,
    mode,
    summary: {
      sourceKey: site.site.key,
      mode,
      crawlRunId: 0,
      requestQueueName: "",
      status: "failed",
      total: 0,
      succeeded: 0,
      failed: 0,
      comicsStored: 0,
      tagsStored: 0,
      chaptersStored: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
      errors: [
        {
          sourceUrl: site.site.startUrls[mode].join(","),
          retryCount: 0,
          errorMessage: message,
        },
      ],
    },
    quality: createEmptyQualityStats(),
    findings: [finding],
    durationMs,
  };
}

async function runSiteMode(
  root: string,
  sqlite: ReturnType<typeof createSqliteDatabase>,
  site: SiteRunnerConfig,
  mode: ComicCrawlerMode,
): Promise<RunRecord> {
  const script = scriptForMode(site, mode);
  const previousRunId = latestRunId(sqlite, site, mode);
  const startedAtMs = Date.now();
  let subprocessError: unknown;

  console.info(`[production] Starting ${site.label} ${mode}.`);

  try {
    await runWorkspaceCommand(
      root,
      [process.execPath, "run", "--filter", "@comics/crawler", script],
      `${site.label} ${mode}`,
      maxRuntimeSecsFor(site, mode),
    );
  } catch (error) {
    subprocessError = error;
  }

  let summary: ComicCrawlSummary;
  try {
    summary = latestSummaryForRun(sqlite, site, mode, previousRunId);
  } catch (error) {
    const message = subprocessError
      ? `Subprocess failed before a crawl run summary was available: ${errorMessageFrom(subprocessError)}; ${errorMessageFrom(error)}`
      : errorMessageFrom(error);
    const record = failedRunRecord(site, mode, message, Date.now() - startedAtMs);
    console.error(`[production] FAILURE ${site.id} ${mode}: ${message}`);
    return record;
  }

  const quality = qualityStatsForRun(sqlite, summary.crawlRunId);
  const findings: QualityFinding[] = [];

  if (summary.status === "failed") {
    findings.push({
      severity: "failure",
      site: site.id,
      mode,
      message: summary.errors.at(-1)?.errorMessage ?? "Crawler recorded failed status.",
    });
  }

  if (subprocessError) {
    findings.push({
      severity: "failure",
      site: site.id,
      mode,
      message: `Subprocess failed: ${errorMessageFrom(subprocessError)}`,
    });
  }

  for (const finding of findings) {
    const log = finding.severity === "failure" ? console.error : console.warn;
    log(`[production] ${finding.severity.toUpperCase()} ${site.id} ${mode}: ${finding.message}`);
  }

  console.info(
    `[production] Finished ${site.label} ${mode}: ${summary.comicsStored} comics, ${summary.chaptersStored} chapter URLs, ${summary.failed} failed request(s), DB status ${summary.status}.`,
  );

  return {
    site: site.id,
    mode,
    summary,
    quality,
    findings,
    durationMs: Date.now() - startedAtMs,
  };
}

async function runSelectedSites(
  root: string,
  sqlite: ReturnType<typeof createSqliteDatabase>,
  command: ProductionCommand,
  records: RunRecord[],
): Promise<void> {
  const modes: ComicCrawlerMode[] = command === "probe-only" ? ["probe"] : ["probe", "full"];
  const targets = selectedSites().flatMap((site) => modes.map((mode) => ({ site, mode })));

  await Promise.allSettled(
    targets.map(async ({ site, mode }) => {
      try {
        records.push(await runSiteMode(root, sqlite, site, mode));
      } catch (error) {
        const message = errorMessageFrom(error);
        console.warn(
          `[production] ${site.id} ${mode} failed without aborting siblings: ${message}`,
        );
        records.push(failedRunRecord(site, mode, message, 0));
      }
    }),
  );
}

function deleteChildrenOlderThan(directory: string, keepDays: number): number {
  if (keepDays < 1 || !existsSync(directory)) {
    return 0;
  }

  const cutoffMs = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  for (const child of readdirSync(directory)) {
    const childPath = join(directory, child);
    const stat = statSync(childPath);

    if (stat.mtimeMs >= cutoffMs) {
      continue;
    }

    rmSync(childPath, { recursive: true, force: true });
    deleted += 1;
  }

  return deleted;
}

function maybeResolveFromRoot(root: string, path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  return isAbsolute(path) ? path : resolveFromRoot(root, path);
}

function cleanupOldArtifacts(root: string): void {
  const storageDir = maybeResolveFromRoot(root, envOptionalString("CRAWLEE_STORAGE_DIR"));
  const logDir = resolveFromRoot(root, envString("PRODUCTION_CRAWLER_LOG_DIR", "logs/crawler"));
  const backupDir = resolveFromRoot(
    root,
    envString("PRODUCTION_CRAWLER_BACKUP_DIR", "data/backups"),
  );
  const storageKeepDays = envPositiveInteger("PRODUCTION_CRAWLER_KEEP_STORAGE_DAYS", 7);
  const logKeepDays = envPositiveInteger("PRODUCTION_CRAWLER_KEEP_LOG_DAYS", 14);
  const backupKeepDays = envPositiveInteger("PRODUCTION_CRAWLER_KEEP_BACKUP_DAYS", 30);

  if (storageDir) {
    const deleted = deleteChildrenOlderThan(storageDir, storageKeepDays);
    console.info(`[production] Deleted ${deleted} old Crawlee storage item(s).`);
  }

  const deletedLogs = deleteChildrenOlderThan(logDir, logKeepDays);
  const deletedBackups = deleteChildrenOlderThan(backupDir, backupKeepDays);

  console.info(`[production] Deleted ${deletedLogs} old log file(s).`);
  console.info(`[production] Deleted ${deletedBackups} old SQLite backup file(s).`);
}

const MODE_ORDER: Record<ComicCrawlerMode, number> = { probe: 0, full: 1 };

function sortRunRecords(records: RunRecord[]): void {
  records.sort((left, right) => {
    const siteOrder = left.site.localeCompare(right.site);

    if (siteOrder !== 0) {
      return siteOrder;
    }

    return MODE_ORDER[left.mode] - MODE_ORDER[right.mode];
  });
}

function recordDurationMs(record: RunRecord): number | undefined {
  if (record.durationMs !== undefined) {
    return record.durationMs;
  }

  const startedAtMs = Date.parse(record.summary.startedAt);
  const finishedAtMs = Date.parse(record.summary.finishedAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(finishedAtMs)) {
    return undefined;
  }

  return Math.max(0, finishedAtMs - startedAtMs);
}

function toProductionSummaryFile(summary: ProductionSummary): ProductionSummaryFile {
  return {
    schemaVersion: 1,
    generatedAt: summary.finishedAt,
    overallStatus: summary.status,
    records: summary.runs.map((record) => ({
      site: record.site,
      mode: record.mode,
      status: record.summary.status,
      crawlRunId: record.summary.crawlRunId,
      comicsStored: record.summary.comicsStored,
      chaptersStored: record.summary.chaptersStored,
      failedRequests: record.summary.failed,
      errorMessage: record.summary.errors.at(-1)?.errorMessage,
      durationMs: recordDurationMs(record),
    })),
  };
}

function writeSummary(root: string, summary: ProductionSummary): string {
  const configuredPath =
    envOptionalString("PRODUCTION_CRAWLER_SUMMARY_PATH") ?? "./data/last-production-summary.json";
  const path = isAbsolute(configuredPath) ? configuredPath : resolveFromRoot(root, configuredPath);

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(toProductionSummaryFile(summary), null, 2)}\n`);
    console.info(`[production] Wrote summary: ${path}`);
  } catch (error) {
    console.error(`[production] Failed to write summary ${path}: ${errorMessageFrom(error)}`);
  }

  return path;
}

async function sendWebhook(summary: ProductionSummary): Promise<void> {
  const webhookUrl = envOptionalString("PRODUCTION_CRAWLER_ALERT_WEBHOOK_URL");

  if (!webhookUrl) {
    return;
  }

  const shouldAlert =
    summary.status === "failed" ||
    summary.findings.some(
      (finding) => finding.severity === "failure" || finding.severity === "warning",
    );

  if (!shouldAlert && !envBoolean("PRODUCTION_CRAWLER_ALERT_ON_SUCCESS", false)) {
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(summary),
    });

    if (!response.ok) {
      console.warn(`[production] Alert webhook returned HTTP ${response.status}.`);
    }
  } catch (error) {
    console.warn(`[production] Failed to send alert webhook: ${String(error)}`);
  }
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv[2]);
  const startedAt = nowIso();
  const startedAtMs = Date.now();
  const root = projectRoot();
  const dbEnv = getDbEnv();
  const dbFileName = isAbsolute(dbEnv.fileName)
    ? dbEnv.fileName
    : resolveFromRoot(root, dbEnv.fileName);
  const crawleeStorageDir = maybeResolveFromRoot(
    root,
    envOptionalString("CRAWLEE_STORAGE_DIR") ?? "storage/crawler",
  );
  process.env.DB_FILE_NAME = dbFileName;
  process.env.CRAWLEE_STORAGE_DIR = crawleeStorageDir ?? "storage/crawler";
  const backupDir = resolveFromRoot(
    root,
    envString("PRODUCTION_CRAWLER_BACKUP_DIR", "data/backups"),
  );
  const lockFile = resolveFromRoot(
    root,
    envString("PRODUCTION_CRAWLER_LOCK_FILE", "data/crawler-production.lock"),
  );
  const releaseLock = acquireLock(lockFile);
  const backupFiles: string[] = [];
  let staleRunningRunsMarkedFailed = 0;
  const records: RunRecord[] = [];
  let status: ProductionStatus = "succeeded";
  let errorMessage: string | undefined;

  try {
    await runMigrations(root);
    await ensureBrowser(root);
    backupFiles.push(...backupSqliteDatabase(dbFileName, backupDir));

    const sqlite = createSqliteDatabase(dbFileName);
    sqlite.exec("PRAGMA busy_timeout = 30000");

    try {
      staleRunningRunsMarkedFailed = markStaleRunningRunsFailed(sqlite);
      await runSelectedSites(root, sqlite, command, records);
    } finally {
      closeSqliteDatabase(sqlite);
    }
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[production] FAILED: ${errorMessage}`);
  } finally {
    releaseLock();
  }

  const finishedAt = nowIso();
  sortRunRecords(records);
  const findings = records.flatMap((record) => record.findings);

  if (
    status === "succeeded" &&
    (records.some((record) => record.summary.status === "failed") ||
      findings.some((finding) => finding.severity === "failure"))
  ) {
    status = "failed";
    errorMessage = "One or more selected crawler runs failed.";
  }

  const summary: ProductionSummary = {
    status,
    command,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedAtMs,
    dbFileName,
    backupFiles,
    staleRunningRunsMarkedFailed,
    runs: records,
    findings,
    errorMessage,
  };

  const summaryPath = writeSummary(root, summary);
  cleanupOldArtifacts(root);
  await sendWebhook(summary);

  console.info(
    `[production] ${status.toUpperCase()} ${command}: ${records.length} crawl run(s), ${findings.length} finding(s), summary ${summaryPath}`,
  );

  if (status === "failed") {
    process.exit(1);
  }
}

await main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Production crawler runner failed:", error);
    process.exit(1);
  });
