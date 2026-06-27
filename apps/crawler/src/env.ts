export interface CrawlerEnv {
  startUrls: string[];
  maxRequests: number;
  headless: boolean;
  captureHtml: boolean;
  storageDir?: string;
}

export type EnvSource = Record<string, string | undefined>;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parsePositiveInteger(
  value: string | undefined,
  name: string,
  defaultValue: number,
): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseStartUrls(value: string | undefined): string[] {
  const urls = value
    ?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (!urls?.length) {
    throw new Error("CRAWLER_START_URLS is required. Provide one or more comma-separated URLs.");
  }

  for (const url of urls) {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("CRAWLER_START_URLS must contain only HTTP or HTTPS URLs.");
    }
  }

  return urls;
}

export function getCrawlerEnv(source: EnvSource = process.env): CrawlerEnv {
  return {
    startUrls: parseStartUrls(source.CRAWLER_START_URLS),
    maxRequests: parsePositiveInteger(source.CRAWLER_MAX_REQUESTS, "CRAWLER_MAX_REQUESTS", 10),
    headless: parseBoolean(source.CRAWLER_HEADLESS, true),
    captureHtml: parseBoolean(source.CRAWLER_CAPTURE_HTML, false),
    storageDir: source.CRAWLEE_STORAGE_DIR?.trim() || undefined,
  };
}
