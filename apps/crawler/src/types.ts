export type CrawlResultStatus = "succeeded" | "failed";

export interface CrawlerConfig {
  startUrls: string[];
  maxRequestsPerCrawl: number;
  headless: boolean;
  captureHtml: boolean;
  storageDir?: string;
}

export interface CrawlResult {
  requestUniqueKey: string;
  sourceUrl: string;
  loadedUrl?: string;
  title?: string;
  textContent?: string;
  htmlContent?: string;
  status: CrawlResultStatus;
  retryCount: number;
  errorMessage?: string;
  crawledAt: string;
}

export interface CrawlSummary {
  total: number;
  succeeded: number;
  failed: number;
  results: CrawlResult[];
}
