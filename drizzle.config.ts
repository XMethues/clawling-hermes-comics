import { defineConfig } from "drizzle-kit";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Set it in .env or via mise env.`);
  }

  return value;
}

export default defineConfig({
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: requiredEnv("DB_FILE_NAME"),
  },
  strict: true,
  verbose: true,
});
