import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";
import { formatQuestionnaireDraft } from "./draft.ts";
import { confirmQuestionnaireDraftUpdate } from "./draft-server.ts";

const { questionnaires } = schema;

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "ti-builder-draft-confirm-"));
  const sqlite = new Database(join(directory, "test.sqlite"));

  sqlite.exec(`
    CREATE TABLE questionnaires (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      description text DEFAULT '' NOT NULL,
      scenario text DEFAULT '' NOT NULL,
      created_by_member_id text NOT NULL,
      current_draft_schema text DEFAULT '{}' NOT NULL,
      internal_note text DEFAULT '' NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      archived_at integer
    );
  `);

  return {
    db: drizzle(sqlite, { schema }),
    cleanup() {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

const originalDraft = {
  title: "Original",
  description: "Original draft",
  scenario: "original scenario",
  dimensions: [
    {
      id: "focus",
      name: "Focus",
      description: "Focus dimension",
    },
  ],
  questions: [
    {
      id: "q1",
      title: "Original question",
      type: "single_choice",
      options: [
        {
          id: "a",
          label: "Original option",
          deltaVector: {
            focus: 1,
          },
        },
      ],
    },
  ],
  resultDebugPrompt: "",
};

const generatedDraft = {
  ...originalDraft,
  title: "Generated",
  description: "Generated draft",
  scenario: "generated scenario",
  questions: [
    {
      id: "q1",
      title: "Generated question",
      type: "single_choice",
      options: [
        {
          id: "a",
          label: "Generated option",
          deltaVector: {
            focus: 2,
          },
        },
      ],
    },
  ],
};

function insertQuestionnaire(db) {
  const now = new Date("2026-06-11T00:00:00.000Z");

  db.insert(questionnaires)
    .values({
      id: "questionnaire_confirm",
      title: originalDraft.title,
      description: originalDraft.description,
      scenario: originalDraft.scenario,
      createdByMemberId: "member_team_001",
      currentDraftSchema: formatQuestionnaireDraft(originalDraft),
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function readQuestionnaire(db) {
  return db.select().from(questionnaires).where(eq(questionnaires.id, "questionnaire_confirm")).get();
}

describe("confirmQuestionnaireDraftUpdate", () => {
  it("does not overwrite the saved draft until confirmation helper is called", () => {
    const { db, cleanup } = createTestDb();

    try {
      insertQuestionnaire(db);
      const generatedText = formatQuestionnaireDraft(generatedDraft);
      const before = readQuestionnaire(db);

      assert.equal(before.title, "Original");
      assert.equal(before.currentDraftSchema.includes("Generated question"), false);

      const result = confirmQuestionnaireDraftUpdate(db, {
        questionnaireId: "questionnaire_confirm",
        schemaText: generatedText,
        now: new Date("2026-06-11T01:00:00.000Z"),
      });

      assert.equal(result.ok, true);
      const after = readQuestionnaire(db);
      assert.equal(after.title, "Generated");
      assert.equal(after.description, "Generated draft");
      assert.equal(after.scenario, "generated scenario");
      assert.equal(after.currentDraftSchema.includes("Generated question"), true);
    } finally {
      cleanup();
    }
  });

  it("rejects invalid generated draft text without changing the current draft", () => {
    const { db, cleanup } = createTestDb();

    try {
      insertQuestionnaire(db);
      const result = confirmQuestionnaireDraftUpdate(db, {
        questionnaireId: "questionnaire_confirm",
        schemaText: JSON.stringify({
          ...generatedDraft,
          questions: [],
        }),
      });

      assert.equal(result.ok, false);
      const after = readQuestionnaire(db);
      assert.equal(after.title, "Original");
      assert.equal(after.currentDraftSchema.includes("Generated question"), false);
    } finally {
      cleanup();
    }
  });
});
