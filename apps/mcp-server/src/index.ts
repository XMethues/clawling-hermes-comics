import { createMcpHonoApp, hostHeaderValidation } from "@modelcontextprotocol/hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import type { Hono } from "hono";

import { getMcpHttpEnv } from "./env";
import { createComicsMcpServer } from "./server";

const env = getMcpHttpEnv();
const mcpServer = createComicsMcpServer(env);
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

await mcpServer.connect(transport);

type McpHonoApp = Hono<{ Variables: { parsedBody?: unknown } }>;

const app = createMcpHonoApp() as unknown as McpHonoApp;

if (env.allowedHosts.length > 0) {
  app.use("*", hostHeaderValidation(env.allowedHosts));
}

app.get("/health", (context) =>
  context.json({
    ok: true,
    name: env.name,
    version: env.version,
    transport: "streamable-http",
    schema: "deferred",
  }),
);

app.all("/mcp", (context) =>
  transport.handleRequest(context.req.raw, { parsedBody: context.get("parsedBody") }),
);

const httpServer = Bun.serve({
  hostname: env.host,
  port: env.port,
  fetch: app.fetch,
});

console.info(`MCP HTTP API listening on http://${env.host}:${httpServer.port}/mcp`);

async function shutdown(signal: string): Promise<void> {
  console.info(`Received ${signal}; shutting down MCP HTTP API.`);
  await transport.close();
  await mcpServer.close();
  httpServer.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
