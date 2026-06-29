import type { ComicSiteAdapter } from "../site";
import { dedupeBy, dedupeStrings, optionalText, requireText, toAbsoluteUrl } from "../site";
import type { ComicChapterExtract, ComicSerializationStatus } from "../types";

const ROUMAN5_BASE_URL = "https://rouman5.com";
const ROUMAN5_ORIGIN = new URL(ROUMAN5_BASE_URL).origin;
const DETAIL_URL_PATTERN = /^https:\/\/rouman5\.com\/books\/[^/?#]+$/i;
const CHAPTER_URL_PATTERN = /^https:\/\/rouman5\.com\/books\/[^/?#]+\/\d+\/?$/i;
const LIST_URL_PATTERN = /^https:\/\/rouman5\.com\/books(?:\?.*)?$/i;

type Rouman5Page = Parameters<ComicSiteAdapter["extractComic"]>[0]["page"];

export const rouman5BlockedUrlPatterns = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  "googletagmanager.com",
  "google-analytics.com",
  "static.cloudflareinsights.com",
  "magsrv.com",
  "clickadu.js",
  "frozenpayerpregnant.com",
  "tsyndicate.com",
];

function isRouman5Url(url: URL): boolean {
  return url.origin === ROUMAN5_ORIGIN;
}

function sourceComicKeyFromUrl(url: URL): string {
  const match = url.pathname.match(/^\/books\/([^/]+)\/?$/);

  if (!match?.[1]) {
    throw new Error(`Rouman5 detail URL expected, got ${url.href}`);
  }

  return match[1];
}

function stripSiteSuffix(value: string): string {
  return value.replace(/\s*-\s*肉漫屋\s*$/u, "").trim();
}

function parseMetricNumber(value: number | string | undefined | null): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : undefined;
  }

  const normalized = value?.trim().replace(/,/gu, "");

  if (!normalized) {
    return undefined;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)([KkMm])?$/u);

  if (!match?.[1]) {
    return undefined;
  }

  const base = Number(match[1]);

  if (!Number.isFinite(base)) {
    return undefined;
  }

  const multiplier = match[2]?.toLowerCase() === "m" ? 1_000_000 : match[2] ? 1_000 : 1;

  return Math.round(base * multiplier);
}

function normalizeSerializationStatus(value: string | undefined): ComicSerializationStatus {
  if (!value) {
    return "unknown";
  }

  if (/完\s*[結结]|已\s*完/u.test(value)) {
    return "completed";
  }

  if (/[連连]\s*[載载]/u.test(value)) {
    return "ongoing";
  }

  return "unknown";
}

async function metaContent(page: Rouman5Page, selector: string): Promise<string | undefined> {
  return optionalText(
    await page
      .locator(selector)
      .getAttribute("content")
      .catch(() => null),
  );
}

async function extractName(
  contextUrl: string,
  pageTitle: string,
  page: Rouman5Page,
): Promise<string> {
  const ogImageAlt = await metaContent(page, 'meta[property="og:image:alt"]');
  const ogTitle = await metaContent(page, 'meta[property="og:title"]');
  const title =
    optionalText(ogImageAlt) ??
    optionalText(ogTitle ? stripSiteSuffix(ogTitle) : undefined) ??
    stripSiteSuffix(pageTitle);

  return requireText(title, `Rouman5 comic name at ${contextUrl}`);
}

async function extractViewCount(page: Rouman5Page): Promise<number | undefined> {
  const jsonLdCount = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) => {
      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent ?? "null");
          const entries = Array.isArray(parsed) ? parsed : [parsed];

          for (const entry of entries) {
            const ratingCount = entry?.aggregateRating?.ratingCount;

            if (ratingCount !== undefined && ratingCount !== null) {
              return String(ratingCount);
            }
          }
        } catch {
          // Ignore malformed JSON-LD and fall back to the visible stat row.
        }
      }

      return null;
    })
    .catch(() => null);
  const jsonLdMetric = parseMetricNumber(jsonLdCount);

  if (jsonLdMetric !== undefined) {
    return jsonLdMetric;
  }

  const visibleMetric = await page
    .locator(
      "div.flex.justify-between.items-center.text-muted-foreground.mt-2 > div.flex.items-center.space-x-1 > div.text-sm",
    )
    .first()
    .innerText()
    .catch(() => null);

  return parseMetricNumber(visibleMetric);
}

async function extractSerializationStatus(page: Rouman5Page): Promise<ComicSerializationStatus> {
  const statusText = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("div"));
    const statusNode = labels.find((node) =>
      /^[狀状][態态]:/u.test(node.textContent?.trim() ?? ""),
    );

    return statusNode?.textContent?.replace(/^[狀状][態态]:\s*/u, "") ?? "";
  });

  return normalizeSerializationStatus(statusText);
}

async function extractTags(page: Rouman5Page): Promise<string[]> {
  const tagText = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("div"));
    const tagNode = labels.find((node) => node.textContent?.trim().startsWith("標籤:"));

    return tagNode?.textContent?.replace(/^標籤:\s*/u, "") ?? "";
  });

  return dedupeStrings(tagText.split(/[\s,，、/]+/u));
}

async function extractChapters(
  page: Rouman5Page,
  sourcePath: string,
): Promise<ComicChapterExtract[]> {
  const chapters = await page.locator(`a[href^="${sourcePath}/"]`).evaluateAll((anchors, path) => {
    return anchors
      .map((anchor): ComicChapterExtract | undefined => {
        const href = anchor.getAttribute("href");

        if (!href) {
          return undefined;
        }

        const url = new URL(href, location.href);
        const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = url.pathname.match(new RegExp(`^${escapedPath}/(\\d+)/?$`));

        if (!match?.[1]) {
          return undefined;
        }

        return {
          position: Number(match[1]),
          title: anchor.textContent?.trim() || undefined,
          url: url.href,
        };
      })
      .filter((chapter): chapter is ComicChapterExtract => Boolean(chapter));
  }, sourcePath);

  return dedupeBy(chapters, (chapter) => chapter.url).sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
}

export const rouman5Site: ComicSiteAdapter = {
  key: "rouman5",
  name: "Rouman5",
  baseUrl: ROUMAN5_BASE_URL,
  startUrls: {
    probe: ["https://rouman5.com/books?page=0&continued=true"],
    full: [
      "https://rouman5.com/books?page=0&continued=true",
      "https://rouman5.com/books?page=0&continued=false",
    ],
  },
  classifyUrl(url) {
    if (!isRouman5Url(url)) {
      return "IGNORE";
    }

    if (CHAPTER_URL_PATTERN.test(url.href)) {
      return "IGNORE";
    }

    if (DETAIL_URL_PATTERN.test(url.href)) {
      return "DETAIL";
    }

    if (url.pathname === "/books" || url.pathname === "/home") {
      return "LIST";
    }

    return "IGNORE";
  },
  async enqueueFromListPage({ enqueueLinks }) {
    await enqueueLinks({
      selector: 'a[href^="/books/"]',
      regexps: [DETAIL_URL_PATTERN],
      exclude: [CHAPTER_URL_PATTERN],
      label: "DETAIL",
      strategy: "same-origin",
    });

    await enqueueLinks({
      selector: 'a[href^="/books?"]',
      regexps: [LIST_URL_PATTERN],
      label: "LIST",
      strategy: "same-origin",
    });
  },
  async extractComic({ page, request }) {
    const sourceUrl = new URL(request.loadedUrl ?? request.url);
    const sourcePath = sourceUrl.pathname.replace(/\/$/u, "");
    const pageTitle = await page.title();
    const name = await extractName(sourceUrl.href, pageTitle, page);
    const description =
      (await metaContent(page, 'meta[name="description"]')) ??
      (await metaContent(page, 'meta[property="og:description"]'));
    const imageSrc = await page
      .locator("img")
      .first()
      .getAttribute("src")
      .catch(() => null);
    const ogImageUrl = await metaContent(page, 'meta[property="og:image"]');
    const imageUrl = ogImageUrl ?? toAbsoluteUrl(imageSrc, sourceUrl.href);
    const chapters = await extractChapters(page, sourcePath);

    return {
      sourceComicKey: sourceComicKeyFromUrl(sourceUrl),
      sourceUrl: sourceUrl.href,
      name,
      mainImageUrl: imageUrl,
      tags: await extractTags(page),
      intro: description,
      viewCount: await extractViewCount(page),
      serializationStatus: await extractSerializationStatus(page),
      chapters,
    };
  },
};
