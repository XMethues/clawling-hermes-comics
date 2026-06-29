import type { ComicSiteAdapter } from "../site";
import { dedupeBy, dedupeStrings, optionalText, requireText, toAbsoluteUrl } from "../site";
import type { ComicChapterExtract, ComicSerializationStatus } from "../types";

const EIGHTEEN_COMIC_BASE_URL = "https://18comic.vip";
const EIGHTEEN_COMIC_ORIGIN = new URL(EIGHTEEN_COMIC_BASE_URL).origin;
const HANMAN_LIST_URL_PATTERN = /^https:\/\/18comic\.vip\/albums\/hanman(?:\?page=\d+)?$/i;
const ALBUM_DETAIL_URL_PATTERN = /^https:\/\/18comic\.vip\/album\/\d+(?:\/[^?#]+)?$/i;
const ALBUM_LINK_WITH_SLUG_URL_PATTERN = /^https:\/\/18comic\.vip\/album\/\d+\/[^?#]+$/i;
const PHOTO_URL_PATTERN = /^https:\/\/18comic\.vip\/photo\/\d+\/?(?:\?.*)?$/i;

type EighteenComicPage = Parameters<ComicSiteAdapter["extractComic"]>[0]["page"];

export const eighteenComicBlockedUrlPatterns = [
  ".webp",
  ".gif",
  ".mp4",
  "googletagmanager.com",
  "google-analytics.com",
  "doubleclick.net",
  "tsyndicate.com",
  "popads.net",
  "d5fr6gt7hy8ju9ki0lo.com",
  "hitgame4us.online",
  "fengyue.ai",
  "labsda.com",
];

function is18ComicUrl(url: URL): boolean {
  return url.origin === EIGHTEEN_COMIC_ORIGIN;
}

function sourceComicKeyFromUrl(url: URL): string {
  const match = url.pathname.match(/^\/album\/(\d+)(?:\/|$)/u);

  if (!match?.[1]) {
    throw new Error(`18comic album URL expected, got ${url.href}`);
  }

  return match[1];
}

function canonicalSourceUrl(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

function stripTitleSuffix(value: string): string {
  return value.replace(/\s+Comics\s*-\s*禁漫天堂\s*$/u, "").trim();
}

function parseMetricNumber(value: string | undefined | null): number | undefined {
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

function normalizeSerializationStatus(values: string[]): ComicSerializationStatus {
  const joined = values.join(" ");

  if (/完\s*[結结]|已\s*完/u.test(joined)) {
    return "completed";
  }

  if (/[連连]\s*[載载]/u.test(joined)) {
    return "ongoing";
  }

  return "unknown";
}

async function metaContent(page: EighteenComicPage, selector: string): Promise<string | undefined> {
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
  page: EighteenComicPage,
): Promise<string> {
  const ogTitle = await metaContent(page, 'meta[property="og:title"]');
  const title =
    optionalText(ogTitle ? stripTitleSuffix(ogTitle) : undefined) ?? stripTitleSuffix(pageTitle);

  return requireText(title, `18comic album name at ${contextUrl}`);
}

async function extractIntro(page: EighteenComicPage): Promise<string | undefined> {
  const visibleIntro = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("h2, div, p"));
    const node = nodes.find((element) => element.textContent?.trim().startsWith("敘述"));

    return node?.textContent?.trim().replace(/^敘述[：:]\s*/u, "") ?? "";
  });

  return (
    optionalText(visibleIntro) ??
    optionalText(
      (await metaContent(page, 'meta[name="description"]'))?.replace(/免費成人H漫線上看\s*$/u, ""),
    ) ??
    optionalText(
      (await metaContent(page, 'meta[property="og:description"]'))?.replace(
        /免費成人H漫線上看\s*$/u,
        "",
      ),
    )
  );
}

async function extractTags(page: EighteenComicPage): Promise<string[]> {
  const tags = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('span[itemprop="genre"][data-type="tags"] a'))
      .map((anchor) => anchor.textContent?.trim() ?? "")
      .filter(Boolean);
  });

  return dedupeStrings(tags);
}

async function extractMainImageUrl(
  page: EighteenComicPage,
  sourceUrl: string,
): Promise<string | undefined> {
  const imageSrc = await page
    .locator('#album_photo_cover img[src*="/media/albums/"]:not([src*="blank.jpg"])')
    .first()
    .getAttribute("src")
    .catch(() => null);

  return toAbsoluteUrl(imageSrc, sourceUrl);
}

async function extractViewCount(page: EighteenComicPage): Promise<number | undefined> {
  const text = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  const match = text.match(/([\d,.]+\s*[KkMm]?)\s*次觀看/u);

  return parseMetricNumber(match?.[1]);
}

async function extractChapters(page: EighteenComicPage): Promise<ComicChapterExtract[]> {
  const chapters = await page
    .locator('#episode-block a[href^="/photo/"], .episode a[href^="/photo/"]')
    .evaluateAll((anchors) => {
      return anchors
        .map((anchor): ComicChapterExtract | undefined => {
          const href = anchor.getAttribute("href");
          const title = anchor.textContent?.replace(/\s+/g, " ").trim();

          if (!href || !title?.startsWith("第")) {
            return undefined;
          }

          const url = new URL(href, location.href);

          if (!/^\/photo\/\d+\/?$/u.test(url.pathname)) {
            return undefined;
          }

          const position = Number(title.match(/^第\s*(\d+)/u)?.[1]);

          return {
            position: Number.isFinite(position) ? position - 1 : undefined,
            title,
            url: url.href,
          };
        })
        .filter((chapter): chapter is ComicChapterExtract => Boolean(chapter));
    });

  return dedupeBy(chapters, (chapter) => chapter.url).sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
}

export const eighteenComicHanmanSite: ComicSiteAdapter = {
  key: "18comic",
  name: "18comic",
  baseUrl: EIGHTEEN_COMIC_BASE_URL,
  startUrls: {
    probe: ["https://18comic.vip/albums/hanman"],
    full: ["https://18comic.vip/albums/hanman"],
  },
  classifyUrl(url) {
    if (!is18ComicUrl(url)) {
      return "IGNORE";
    }

    if (PHOTO_URL_PATTERN.test(url.href)) {
      return "IGNORE";
    }

    if (ALBUM_DETAIL_URL_PATTERN.test(url.href)) {
      return "DETAIL";
    }

    if (HANMAN_LIST_URL_PATTERN.test(url.href)) {
      return "LIST";
    }

    return "IGNORE";
  },
  async enqueueFromListPage({ enqueueLinks }) {
    await enqueueLinks({
      selector: 'a[href^="/album/"]',
      regexps: [ALBUM_LINK_WITH_SLUG_URL_PATTERN],
      exclude: [PHOTO_URL_PATTERN],
      label: "DETAIL",
      strategy: "same-origin",
    });

    await enqueueLinks({
      selector: 'a[href^="/albums/hanman?page="]',
      regexps: [HANMAN_LIST_URL_PATTERN],
      label: "LIST",
      strategy: "same-origin",
    });
  },
  async extractComic({ page, request }) {
    const sourceUrl = new URL(request.loadedUrl ?? request.url);
    const canonicalUrl = canonicalSourceUrl(sourceUrl);
    const pageTitle = await page.title();
    const name = await extractName(sourceUrl.href, pageTitle, page);
    const tags = await extractTags(page);
    const chapters = await extractChapters(page);

    return {
      sourceComicKey: sourceComicKeyFromUrl(sourceUrl),
      sourceUrl: canonicalUrl,
      name,
      mainImageUrl: await extractMainImageUrl(page, sourceUrl.href),
      tags,
      intro: await extractIntro(page),
      viewCount: await extractViewCount(page),
      serializationStatus: normalizeSerializationStatus(tags),
      chapters,
    };
  },
};
