import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { invalidParams, jsonResourceContents } from "../tools/common";
import { getComic } from "../tools/getComic";

export function registerComicResource(server: McpServer): void {
  server.registerResource(
    "comic",
    new ResourceTemplate("comic://{comicId}", { list: undefined }),
    {
      title: "Comic details",
      description: "Full JSON details for a single comic by comics.id.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const comicId = parsePositiveIntegerVariable(variables.comicId, "comicId");
      const result = await getComic({ comicId });

      return jsonResourceContents(uri, result);
    },
  );
}

function parsePositiveIntegerVariable(value: string | string[] | undefined, name: string): number {
  const text = Array.isArray(value) ? value[0] : value;
  const parsed = Number(text);

  if (!text || !Number.isInteger(parsed) || parsed < 1) {
    throw invalidParams(`Resource variable '${name}' must be a positive integer.`);
  }

  return parsed;
}
