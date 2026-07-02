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

export type ComicCrawlerMode = "probe" | "full";
export type ComicCrawlRunStatus = "running" | "succeeded" | "failed";
export type ComicRouteLabel = "LIST" | "DETAIL";
export type ComicPageKind = ComicRouteLabel | "IGNORE";
export type ComicSerializationStatus = "ongoing" | "completed" | "unknown";

export interface ComicSiteMetadata {
  key: string;
  name: string;
  baseUrl: string;
}

export interface ComicSiteStartUrls {
  probe: string[];
  full: string[];
}

export interface ComicChapterExtract {
  title?: string;
  url: string;
  position?: number;
}

export interface StandardComicExtract {
  sourceComicKey: string;
  sourceUrl: string;
  name: string;
  mainImageUrl?: string;
  tags: string[];
  intro?: string;
  viewCount?: number;
  serializationStatus?: ComicSerializationStatus;
  chapters: ComicChapterExtract[];
}

export interface ComicStoredResult {
  comicId: number;
  sourceEntryId: number;
  tagsStored: number;
  chaptersStored: number;
}

export interface ComicCrawlError {
  sourceUrl: string;
  loadedUrl?: string;
  retryCount: number;
  errorMessage: string;
}

export interface ComicCrawlSummary {
  sourceKey: string;
  mode: ComicCrawlerMode;
  crawlRunId: number;
  requestQueueName: string;
  datasetName?: string;
  status: Exclude<ComicCrawlRunStatus, "running">;
  total: number;
  succeeded: number;
  failed: number;
  comicsStored: number;
  tagsStored: number;
  chaptersStored: number;
  startedAt: string;
  finishedAt: string;
  errors: ComicCrawlError[];
}
