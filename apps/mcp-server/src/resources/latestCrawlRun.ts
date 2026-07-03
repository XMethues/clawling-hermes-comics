import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/server";

import { invalidParams, jsonResourceContents } from "../tools/common";
import { getLatestCrawlRun } from "../tools/getLatestCrawlRun";

export function registerLatestCrawlRunResource(server: McpServer): void {
  server.registerResource(
    "latest-crawl-run",
    new ResourceTemplate("crawl://latest/{sourceKey}", { list: undefined }),
    {
      title: "Latest crawl run",
      description: "Latest crawl-run JSON for one comic source key.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const sourceKey = parseStringVariable(variables.sourceKey, "sourceKey");
      const result = await getLatestCrawlRun({ sourceKey });

      return jsonResourceContents(uri, result);
    },
  );
}

function parseStringVariable(value: string | string[] | undefined, name: string): string {
  const text = (Array.isArray(value) ? value[0] : value)?.trim();

  if (!text) {
    throw invalidParams(`Resource variable '${name}' is required.`);
  }

  return text;
}
