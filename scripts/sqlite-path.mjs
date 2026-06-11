import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function sqlitePathFromDatabaseUrl(databaseUrl) {
  if (databaseUrl.startsWith("file:")) {
    return databaseUrl.slice("file:".length);
  }

  return databaseUrl;
}

export function ensureSqliteDirectory(databaseUrl) {
  const sqlitePath = sqlitePathFromDatabaseUrl(databaseUrl);
  if (sqlitePath === ":memory:" || sqlitePath.startsWith("file:")) {
    return sqlitePath;
  }

  const directory = dirname(sqlitePath);
  if (directory !== ".") {
    mkdirSync(directory, { recursive: true });
  }

  return sqlitePath;
}
