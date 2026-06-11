import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

function sqlitePathFromUrl(databaseUrl: string): string {
  if (databaseUrl.startsWith("file:")) {
    return databaseUrl.slice("file:".length);
  }

  return databaseUrl;
}

function ensureSqliteDirectory(sqlitePath: string) {
  if (sqlitePath === ":memory:" || sqlitePath.startsWith("file:")) {
    return;
  }

  const directory = dirname(sqlitePath);
  if (directory !== ".") {
    mkdirSync(directory, { recursive: true });
  }
}

export function createDb() {
  const sqlitePath = sqlitePathFromUrl(getServerEnv().DATABASE_URL);
  ensureSqliteDirectory(sqlitePath);
  const sqlite = new Database(sqlitePath);
  return drizzle(sqlite, { schema });
}

export type AppDb = ReturnType<typeof createDb>;
