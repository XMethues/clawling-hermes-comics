import { McpServer, ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";

import type { McpHttpEnv } from "./env";
import { registerComicResource } from "./resources/comic";
import { registerLatestCrawlRunResource } from "./resources/latestCrawlRun";
import { type CatalogTool, jsonToolResult } from "./tools/common";
import { getComicTool } from "./tools/getComic";
import { getLatestCrawlRunTool } from "./tools/getLatestCrawlRun";
import { listComicsTool } from "./tools/listComics";
import { listSourcesTool } from "./tools/listSources";
import { searchByTagTool } from "./tools/searchByTag";

const catalogTools: CatalogTool<unknown>[] = [
  listSourcesTool as unknown as CatalogTool<unknown>,
  listComicsTool as unknown as CatalogTool<unknown>,
  getComicTool as unknown as CatalogTool<unknown>,
  searchByTagTool as unknown as CatalogTool<unknown>,
  getLatestCrawlRunTool as unknown as CatalogTool<unknown>,
];

export function createComicsMcpServer(env: Pick<McpHttpEnv, "name" | "version">): McpServer {
  const server = new McpServer({
    name: env.name,
    version: env.version,
  });

  registerCatalogTools(server);
  registerComicResource(server);
  registerLatestCrawlRunResource(server);

  return server;
}

function registerCatalogTools(server: McpServer): void {
  server.server.registerCapabilities({ tools: { listChanged: true } });

  server.server.setRequestHandler("tools/list", () => ({
    tools: catalogTools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.server.setRequestHandler("tools/call", async (request) => {
    const tool = catalogTools.find((candidate) => candidate.name === request.params.name);

    if (!tool) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Tool '${request.params.name}' was not found.`,
      );
    }

    const input = tool.parse(request.params.arguments);
    const output = await tool.execute(input);

    return jsonToolResult(output);
  });
}
