import { getDbEnv } from "@comics/db";

import { runCrawler } from "./crawler";
import { getCrawlerEnv } from "./env";

async function main(): Promise<void> {
  const dbEnv = getDbEnv();
  const crawlerEnv = getCrawlerEnv();

  console.info(`Catalog persistence wired to ${dbEnv.fileName}.`);
  console.info(`Starting crawler for ${crawlerEnv.startUrls.length} URL(s).`);

  const summary = await runCrawler({
    startUrls: crawlerEnv.startUrls,
    maxRequestsPerCrawl: crawlerEnv.maxRequests,
    headless: crawlerEnv.headless,
    captureHtml: crawlerEnv.captureHtml,
    storageDir: crawlerEnv.storageDir,
  });

  console.info(
    `Crawler finished: ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.total} total.`,
  );
}

await main().catch((error) => {
  console.error("Crawler failed:", error);
  process.exit(1);
});
