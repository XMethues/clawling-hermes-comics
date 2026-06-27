/**
 * Initial schema is intentionally empty.
 *
 * The first content-modeling pass will add crawl/domain tables here once the
 * crawler result shape is known. Keeping this module present now lets Drizzle
 * Kit, the crawler app, and the MCP API share one stable package boundary.
 */
export const schema = {};

export type DbSchema = typeof schema;
