# MCP Server

## MCP API

The server exposes read-only catalog access over Streamable HTTP at `/mcp`. It reads the SQLite database from `DB_FILE_NAME` and listens on `MCP_PORT`.

### Tools

#### `list_sources`

Input: none.

Returns:

```ts
Array<{
  key: string;
  name: string;
  baseUrl: string;
  latestRunStatus: string | null;
  latestRunAt: string | null;
  comicCount: number;
}>;
```

#### `list_comics`

Input:

```ts
{
  sourceKey: string;
  limit?: number; // default 20, 1..100
  offset?: number; // default 0, >= 0
}
```

Returns:

```ts
{
  total: number;
  items: Array<{
    id: number;
    name: string;
    sourceUrl: string;
    viewCount: number | null;
    serializationStatus: string;
    tags: string[];
    chapterCount: number;
    lastCrawledAt: string;
  }>;
}
```

#### `get_comic`

Input:

```ts
{ comicId: number }
```

Returns:

```ts
{
  id: number;
  name: string;
  mainImageUrl: string | null;
  intro: string | null;
  sources: Array<{
    sourceKey: string;
    sourceUrl: string;
    viewCount: number | null;
    serializationStatus: string;
    chapters: Array<{
      position: number;
      title: string | null;
      url: string;
    }>;
  }>;
}
```

#### `search_by_tag`

Input:

```ts
{
  tag: string;
  limit?: number; // default 20, 1..100
  offset?: number; // default 0, >= 0
}
```

Returns:

```ts
{
  total: number;
  items: Array<{
    id: number;
    name: string;
    sourceKey: string;
    viewCount: number | null;
  }>;
}
```

#### `get_latest_crawl_run`

Input:

```ts
{ sourceKey?: string }
```

Returns:

```ts
Array<{
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
}>;
```

### Resources

- `comic://{comicId}` — `application/json`, returns the same JSON as `get_comic({ comicId })`.
- `crawl://latest/{sourceKey}` — `application/json`, returns the same JSON as `get_latest_crawl_run({ sourceKey })`.
