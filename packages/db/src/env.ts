export interface DbEnv {
  fileName: string;
}

export type EnvSource = Record<string, string | undefined>;

export function getDbEnv(source: EnvSource = process.env): DbEnv {
  const fileName = source.DB_FILE_NAME?.trim();

  if (!fileName) {
    throw new Error("DB_FILE_NAME is required. Set it in .env or through mise env.");
  }

  return { fileName };
}
