import { createPlaywrightRouter, PlaywrightCrawler, RequestQueue } from "crawlee";

import type { CrawlerConfig, CrawlResult, CrawlSummary } from "./types";

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

  await crawler.run();

  return summarize(results);
}
