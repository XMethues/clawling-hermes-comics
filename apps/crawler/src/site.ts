import type { PlaywrightCrawlingContext } from "crawlee";

import type {
  ComicPageKind,
  ComicRouteLabel,
  ComicSiteMetadata,
  ComicSiteStartUrls,
  StandardComicExtract,
} from "./types";

export type ComicSiteCrawlingContext = PlaywrightCrawlingContext;

export interface ComicSiteAdapter extends ComicSiteMetadata {
  startUrls: ComicSiteStartUrls;
  classifyUrl(url: URL): ComicPageKind;
  enqueueFromListPage(context: ComicSiteCrawlingContext): Promise<void>;
  extractComic(context: ComicSiteCrawlingContext): Promise<StandardComicExtract>;
}

export function routeLabelForUrl(site: ComicSiteAdapter, url: string): ComicRouteLabel | undefined {
  const kind = site.classifyUrl(new URL(url));

  return kind === "IGNORE" ? undefined : kind;
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function requireText(value: string | undefined | null, fieldName: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

export function optionalText(value: string | undefined | null): string | undefined {
  const normalized = value?.trim();

  return normalized || undefined;
}

export function toAbsoluteUrl(
  href: string | undefined | null,
  baseUrl: string,
): string | undefined {
  const trimmed = href?.trim();

  if (!trimmed) {
    return undefined;
  }

  return new URL(trimmed, baseUrl).href;
}

export function dedupeBy<T>(items: T[], keyForItem: (item: T) => string): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = keyForItem(item);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function dedupeStrings(values: string[]): string[] {
  return dedupeBy(values.map((value) => value.trim()).filter(Boolean), (value) =>
    normalizeName(value),
  );
}
