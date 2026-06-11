import Database from "better-sqlite3";
import { ensureSqliteDirectory } from "./sqlite-path.mjs";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/workbench.sqlite";
const sqlitePath = ensureSqliteDirectory(databaseUrl);
const db = new Database(sqlitePath);

const now = Date.now();
const members = [
  { id: "member_team_001", name: "团队成员 1", role: "member" },
  { id: "member_team_002", name: "团队成员 2", role: "member" },
  { id: "member_team_003", name: "团队成员 3", role: "member" },
  { id: "member_team_004", name: "团队成员 4", role: "member" },
];

const insertMember = db.prepare(`
  INSERT INTO members (id, name, role, created_at)
  VALUES (@id, @name, @role, @createdAt)
  ON CONFLICT(id) DO NOTHING
`);

const seedMembers = db.transaction(() => {
  for (const member of members) {
    insertMember.run({ ...member, createdAt: now });
  }
});

seedMembers();

const count = db.prepare("SELECT COUNT(*) AS count FROM members").get().count;
console.log(`Seed complete. Members in database: ${count}`);

db.close();
