import { spawnSync } from "node:child_process";
import { ensureSqliteDirectory } from "./sqlite-path.mjs";

ensureSqliteDirectory(process.env.DATABASE_URL ?? "file:./data/workbench.sqlite");

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
