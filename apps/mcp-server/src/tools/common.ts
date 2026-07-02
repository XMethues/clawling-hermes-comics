import { Database } from "bun:sqlite";
import { type ComicsDb, createDb, getDbEnv } from "@comics/db";
import {
  type CallToolResult,
  type JsonSchemaType,
  ProtocolError,
  ProtocolErrorCode,
  type Tool,
} from "@modelcontextprotocol/server";
import type { z } from "zod/v4";

import type { CatalogQueryOptions } from "../types";

export interface CatalogTool<Input> {
  name: string;
  title: string;
  description: string;
  inputSchema: Tool["inputSchema"];
  parse(input: unknown): Input;
  execute(input: Input): Promise<unknown>;
}

export const emptyInputJsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} satisfies Tool["inputSchema"];

export const paginationJsonSchema = {
  limit: {
    type: "integer",
    minimum: 1,
    maximum: 100,
    default: 20,
  },
  offset: {
    type: "integer",
    minimum: 0,
    default: 0,
  },
} satisfies Record<string, JsonSchemaType>;

export function jsonToolResult(output: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}

export function jsonResourceContents(uri: URL, output: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}

export function invalidParams(message: string): ProtocolError {
  return new ProtocolError(ProtocolErrorCode.InvalidParams, message);
}

export function invalidRequest(message: string): ProtocolError {
  return new ProtocolError(ProtocolErrorCode.InvalidRequest, message);
}

export function internalDbError(error: unknown): ProtocolError {
  return new ProtocolError(
    ProtocolErrorCode.InternalError,
    `Database error: ${formatError(error)}`,
  );
}

export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  toolName: string,
): z.infer<Schema> {
  const result = schema.safeParse(input ?? {});

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
      .join("; ");
    throw invalidParams(`Invalid arguments for ${toolName}: ${message}`);
  }

  return result.data;
}

export async function withCatalogDb<T>(
  options: CatalogQueryOptions | undefined,
  query: (db: ComicsDb) => T | Promise<T>,
): Promise<T> {
  let sqlite: Database | undefined;

  try {
    const fileName = options?.dbFileName ?? getDbEnv().fileName;
    sqlite = new Database(fileName, { readonly: true });
    sqlite.exec("PRAGMA foreign_keys = ON");

    return await query(createDb({ sqlite }));
  } catch (error) {
    if (error instanceof ProtocolError) {
      throw error;
    }

    throw internalDbError(error);
  } finally {
    sqlite?.close();
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
