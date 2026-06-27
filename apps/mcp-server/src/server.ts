import { getDbEnv, schema } from "@comics/db";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";

import type { McpHttpEnv } from "./env";

export function createComicsMcpServer(env: Pick<McpHttpEnv, "name" | "version">): McpServer {
  const server = new McpServer({
    name: env.name,
    version: env.version,
  });

  server.registerTool(
    "storage_status",
    {
      description: "Report configured SQLite storage for the current skeleton.",
      inputSchema: z.object({}),
    },
    async () => {
      const dbEnv = getDbEnv();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                dbFileName: dbEnv.fileName,
                schema: "deferred",
                tables: Object.keys(schema),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}
