export interface CatalogQueryOptions {
  dbFileName?: string;
}

export interface ListSourcesResultItem {
  key: string;
  name: string;
  baseUrl: string;
  latestRunStatus: string | null;
  latestRunAt: string | null;
  comicCount: number;
}

export interface ListComicsInput {
  sourceKey: string;
  limit: number;
  offset: number;
}

export interface ListComicsResultItem {
  id: number;
  name: string;
  sourceUrl: string;
  viewCount: number | null;
  serializationStatus: string;
  tags: string[];
  chapterCount: number;
  lastCrawledAt: string;
}

export interface ListComicsResult {
  total: number;
  items: ListComicsResultItem[];
}

export interface GetComicInput {
  comicId: number;
}

export interface ComicSourceChapterResult {
  position: number;
  title: string | null;
  url: string;
}

export interface ComicSourceResult {
  sourceKey: string;
  sourceUrl: string;
  viewCount: number | null;
  serializationStatus: string;
  chapters: ComicSourceChapterResult[];
}

export interface GetComicResult {
  id: number;
  name: string;
  mainImageUrl: string | null;
  intro: string | null;
  sources: ComicSourceResult[];
}

export interface SearchByTagInput {
  tag: string;
  limit: number;
  offset: number;
}

export interface SearchByTagResultItem {
  id: number;
  name: string;
  sourceKey: string;
  viewCount: number | null;
}

export interface SearchByTagResult {
  total: number;
  items: SearchByTagResultItem[];
}

export interface GetLatestCrawlRunInput {
  sourceKey?: string;
}

export interface LatestCrawlRunResultItem {
  sourceKey: string;
  mode: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  pagesSucceeded: number;
  pagesFailed: number;
  comicsStored: number;
  chaptersStored: number;
  errorMessage?: string;
}
