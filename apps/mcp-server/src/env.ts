export interface McpHttpEnv {
  name: string;
  version: string;
  host: string;
  port: number;
  allowedHosts: string[];
}

export type EnvSource = Record<string, string | undefined>;

function optionalString(value: string | undefined, defaultValue: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : defaultValue;
}

function parsePort(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("MCP_PORT must be an integer between 1 and 65535.");
  }

  return parsed;
}

function parseAllowedHosts(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((host) => host.trim())
      .filter(Boolean) ?? []
  );
}

export function getMcpHttpEnv(source: EnvSource = process.env): McpHttpEnv {
  return {
    name: optionalString(source.MCP_SERVER_NAME, "comics-mcp-server"),
    version: optionalString(source.MCP_SERVER_VERSION, "0.1.0"),
    host: optionalString(source.MCP_HOST, "0.0.0.0"),
    port: parsePort(source.MCP_PORT, 3000),
    allowedHosts: parseAllowedHosts(source.MCP_ALLOWED_HOSTS),
  };
}
