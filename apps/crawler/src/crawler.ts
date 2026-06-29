import type { ComicsDb } from "@comics/db";
import { buildLaunchOptions } from "cloakbrowser";
import {
  createPlaywrightRouter,
  Dataset,
  PlaywrightCrawler,
  type PlaywrightCrawlingContext,
  type PlaywrightLaunchContext,
  RequestQueue,
} from "crawlee";
import { chromium } from "playwright";

import { type ComicSiteAdapter, routeLabelForUrl } from "./site";
import { finishCrawlRun, startCrawlRun, storeExtractedComic } from "./storage";
import type {
  ComicCrawlError,
  ComicCrawlerMode,
  ComicCrawlSummary,
  ComicStoredResult,
  CrawlerConfig,
  CrawlResult,
  CrawlSummary,
  StandardComicExtract,
} from "./types";

export interface ComicSiteCrawlerConfig {
  db: ComicsDb;
  site: ComicSiteAdapter;
  mode: ComicCrawlerMode;
  startUrls: string[];
  maxRequestsPerCrawl: number;
  headless: boolean;
  storageDir?: string;
  maxConcurrency?: number;
  sameDomainDelaySecs?: number;
  blockRequestUrlPatterns?: string[];
  maxRuntimeSecs?: number;
}

interface ComicCrawlCounters {
  succeeded: number;
  failed: number;
  comicsStored: number;
  tagsStored: number;
  chaptersStored: number;
  errors: ComicCrawlError[];
}

async function createCloakLaunchContext(headless: boolean): Promise<PlaywrightLaunchContext> {
  const launchOptions = await buildLaunchOptions({ headless });

  return {
    launcher: chromium,
    launchOptions: launchOptions as PlaywrightLaunchContext["launchOptions"],
  };
}

function summarize(results: CrawlResult[]): CrawlSummary {
  const succeeded = results.filter((result) => result.status === "succeeded").length;
  const failed = results.filter((result) => result.status === "failed").length;

  return {
    total: results.length,
    succeeded,
    failed,
    results,
  };
}

function createQueueName(siteKey: string, mode: ComicCrawlerMode): string {
  return `comic-${siteKey}-${mode}-${crypto.randomUUID()}`;
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addStoredResult(counters: ComicCrawlCounters, result: ComicStoredResult): void {
  counters.comicsStored += 1;
  counters.tagsStored += result.tagsStored;
  counters.chaptersStored += result.chaptersStored;
}

async function runPlaywrightCrawler(
  crawler: PlaywrightCrawler,
  maxRuntimeSecs: number | undefined,
): Promise<void> {
  if (!maxRuntimeSecs) {
    await crawler.run();
    return;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Crawler exceeded max runtime of ${maxRuntimeSecs} second(s).`));
    }, maxRuntimeSecs * 1_000);
  });

  try {
    await Promise.race([crawler.run(), timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function handleListPage(
  site: ComicSiteAdapter,
  context: PlaywrightCrawlingContext,
): Promise<void> {
  await site.enqueueFromListPage(context);
  context.log.info(`Queued links from ${context.request.loadedUrl ?? context.request.url}`);
}

async function handleDetailPage(
  config: ComicSiteCrawlerConfig,
  crawlRunId: number,
  dataset: Dataset<StandardComicExtract>,
  counters: ComicCrawlCounters,
  context: PlaywrightCrawlingContext,
): Promise<void> {
  const comic = await config.site.extractComic(context);
  const stored = storeExtractedComic(config.db, {
    source: config.site,
    crawlRunId,
    comic,
    crawledAt: new Date().toISOString(),
  });

  addStoredResult(counters, stored);

  await dataset.pushData(comic).catch((error) => {
    context.log.warning(
      `Stored comic ${comic.name}, but failed to push diagnostic Dataset record: ${errorMessageFrom(error)}`,
    );
  });

  context.log.info(`Stored comic ${comic.name} with ${stored.chaptersStored} chapter URL(s).`);
}

export async function runCrawler(config: CrawlerConfig): Promise<CrawlSummary> {
  if (config.storageDir) {
    process.env.CRAWLEE_STORAGE_DIR = config.storageDir;
  }

  const results: CrawlResult[] = [];
  const requestQueue = await RequestQueue.open(`crawler-${crypto.randomUUID()}`);

  await requestQueue.addRequests(config.startUrls.map((url) => ({ url })));

  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, log }) => {
    const title = await page.title();
    const textContent = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const htmlContent = config.captureHtml ? await page.content() : undefined;

    results.push({
      requestUniqueKey: request.uniqueKey,
      sourceUrl: request.url,
      loadedUrl: request.loadedUrl,
      title,
      textContent,
      htmlContent,
      status: "succeeded",
      retryCount: request.retryCount,
      crawledAt: new Date().toISOString(),
    });

    log.info(`Crawled ${request.loadedUrl ?? request.url}`);
  });

  const crawler = new PlaywrightCrawler({
    requestQueue,
    requestHandler: router,
    maxRequestsPerCrawl: config.maxRequestsPerCrawl,
    headless: config.headless,
    launchContext: await createCloakLaunchContext(config.headless),
    failedRequestHandler: async ({ request, log }) => {
      const errorMessage = request.errorMessages.at(-1) ?? "Unknown error";

      results.push({
        requestUniqueKey: request.uniqueKey,
        sourceUrl: request.url,
        loadedUrl: request.loadedUrl,
        status: "failed",
        retryCount: request.retryCount,
        errorMessage,
        crawledAt: new Date().toISOString(),
      });

      log.error(`Failed ${request.url}: ${errorMessage}`);
    },
  });

  try {
    await runPlaywrightCrawler(crawler, undefined);
  } finally {
    await crawler.teardown().catch(() => undefined);
  }

  return summarize(results);
}

export async function runComicSiteCrawler(
  config: ComicSiteCrawlerConfig,
): Promise<ComicCrawlSummary> {
  if (config.storageDir) {
    process.env.CRAWLEE_STORAGE_DIR = config.storageDir;
  }

  const requestQueueName = createQueueName(config.site.key, config.mode);
  const datasetName = `${requestQueueName}-results`;
  const startedAt = new Date().toISOString();
  const requestQueue = await RequestQueue.open(requestQueueName);
  const dataset = await Dataset.open<StandardComicExtract>(datasetName);
  const counters: ComicCrawlCounters = {
    succeeded: 0,
    failed: 0,
    comicsStored: 0,
    tagsStored: 0,
    chaptersStored: 0,
    errors: [],
  };

  await requestQueue.addRequests(
    config.startUrls.map((url) => ({
      url,
      label: routeLabelForUrl(config.site, url) ?? "LIST",
    })),
  );

  const launchContext = await createCloakLaunchContext(config.headless);
  const { crawlRun } = startCrawlRun(config.db, {
    source: config.site,
    mode: config.mode,
    startUrls: config.startUrls,
    requestQueueName,
    datasetName,
    startedAt,
  });

  let crawler: PlaywrightCrawler | undefined;
  let runError: unknown;
  let finalizationError: unknown;
  let finishedAt = "";

  try {
    const router = createPlaywrightRouter();

    router.addHandler("LIST", async (context) => {
      await handleListPage(config.site, context);
      counters.succeeded += 1;
    });

    router.addHandler("DETAIL", async (context) => {
      await handleDetailPage(config, crawlRun.id, dataset, counters, context);
      counters.succeeded += 1;
    });

    router.addDefaultHandler(async (context) => {
      const label = routeLabelForUrl(config.site, context.request.url);

      if (label === "LIST") {
        await handleListPage(config.site, context);
        counters.succeeded += 1;
        return;
      }

      if (label === "DETAIL") {
        await handleDetailPage(config, crawlRun.id, dataset, counters, context);
        counters.succeeded += 1;
        return;
      }

      context.log.debug(`Ignored ${context.request.url}`);
    });

    crawler = new PlaywrightCrawler({
      requestQueue,
      requestHandler: router,
      maxRequestsPerCrawl: config.maxRequestsPerCrawl,
      headless: config.headless,
      launchContext,
      maxConcurrency: config.maxConcurrency ?? 1,
      sameDomainDelaySecs: config.sameDomainDelaySecs ?? 2,
      respectRobotsTxtFile: true,
      preNavigationHooks: [
        async ({ blockRequests }) => {
          if (config.blockRequestUrlPatterns?.length) {
            await blockRequests({ extraUrlPatterns: config.blockRequestUrlPatterns });
          }
        },
      ],
      failedRequestHandler: async ({ request, log }) => {
        const errorMessage = request.errorMessages.at(-1) ?? "Unknown error";

        counters.failed += 1;
        counters.errors.push({
          sourceUrl: request.url,
          loadedUrl: request.loadedUrl,
          retryCount: request.retryCount,
          errorMessage,
        });

        log.error(`Failed ${request.url}: ${errorMessage}`);
      },
    });

    await runPlaywrightCrawler(crawler, config.maxRuntimeSecs);
  } catch (error) {
    runError = error;
    counters.failed += 1;
    counters.errors.push({
      sourceUrl: config.startUrls.join(","),
      retryCount: 0,
      errorMessage: errorMessageFrom(error),
    });
  } finally {
    finishedAt = new Date().toISOString();
    const finalStatus = runError || counters.failed > 0 ? "failed" : "succeeded";

    try {
      finishCrawlRun(config.db, {
        crawlRunId: crawlRun.id,
        status: finalStatus,
        pagesSucceeded: counters.succeeded,
        pagesFailed: counters.failed,
        comicsStored: counters.comicsStored,
        chaptersStored: counters.chaptersStored,
        errorMessage: counters.errors.at(-1)?.errorMessage,
        finishedAt,
      });
    } catch (error) {
      finalizationError = error;
      counters.errors.push({
        sourceUrl: config.startUrls.join(","),
        retryCount: 0,
        errorMessage: `Failed to finalize crawl run ${crawlRun.id}: ${errorMessageFrom(error)}`,
      });
    }

    if (crawler) {
      try {
        await crawler.teardown();
      } catch (error) {
        finalizationError ??= error;
        counters.errors.push({
          sourceUrl: config.startUrls.join(","),
          retryCount: 0,
          errorMessage: `Failed to teardown crawler: ${errorMessageFrom(error)}`,
        });
      }
    }
  }

  if (runError) {
    throw runError;
  }

  if (finalizationError) {
    throw finalizationError;
  }

  return {
    sourceKey: config.site.key,
    mode: config.mode,
    crawlRunId: crawlRun.id,
    requestQueueName,
    datasetName,
    total: counters.succeeded + counters.failed,
    succeeded: counters.succeeded,
    failed: counters.failed,
    comicsStored: counters.comicsStored,
    tagsStored: counters.tagsStored,
    chaptersStored: counters.chaptersStored,
    startedAt,
    finishedAt,
    errors: counters.errors,
  };
}
