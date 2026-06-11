import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";

import * as schema from "../db/schema.ts";
import {
  publishQuestionnaireVersion,
  updateQuestionnaireVersionMutableFields,
} from "./publish.ts";
import { formatQuestionnaireDraft } from "./draft.ts";

const { members, questionnaireVersions, questionnaires } = schema;

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "ti-builder-publish-"));
  const sqlite = new Database(join(directory, "test.sqlite"));

  sqlite.exec(`
    CREATE TABLE members (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL UNIQUE,
      role text DEFAULT 'member' NOT NULL,
      created_at integer NOT NULL,
      archived_at integer
    );

    CREATE TABLE questionnaires (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      description text DEFAULT '' NOT NULL,
      scenario text DEFAULT '' NOT NULL,
      created_by_member_id text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      current_draft_schema text DEFAULT '{}' NOT NULL,
      internal_note text DEFAULT '' NOT NULL,
      FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON UPDATE cascade ON DELETE restrict
    );

    CREATE TABLE questionnaire_versions (
      id text PRIMARY KEY NOT NULL,
      questionnaire_id text NOT NULL,
      version_number integer NOT NULL,
      schema_snapshot text NOT NULL,
      published_by_member_id text NOT NULL,
      publish_note text DEFAULT '' NOT NULL,
      test_token text NOT NULL,
      test_token_max_responses integer DEFAULT 50 NOT NULL,
      test_token_response_count integer DEFAULT 0 NOT NULL,
      test_token_disabled_at integer,
      external_result_detail_level text DEFAULT 'summary' NOT NULL,
      created_at integer NOT NULL,
      FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON UPDATE cascade ON DELETE cascade,
      FOREIGN KEY (published_by_member_id) REFERENCES members(id) ON UPDATE cascade ON DELETE restrict
    );

    CREATE UNIQUE INDEX questionnaire_versions_questionnaire_version_unique
      ON questionnaire_versions (questionnaire_id, version_number);
    CREATE UNIQUE INDEX questionnaire_versions_test_token_unique
      ON questionnaire_versions (test_token);
  `);

  return {
    db: drizzle(sqlite, { schema }),
    cleanup() {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function draftWithTitle(title) {
  return {
    title,
    description: "Internal validation questionnaire",
    scenario: "major_exploration",
    dimensions: [
      {
        id: "analytical",
        name: "Analytical",
        description: "Structured problem solving",
      },
    ],
    questions: [
      {
        id: "q1",
        type: "single_choice",
        title: "How do you start?",
        options: [
          {
            id: "a",
            label: "Find structure",
            deltaVector: {
              analytical: 1,
            },
          },
        ],
      },
    ],
    resultDebugPrompt: "",
  };
}

describe("publishQuestionnaireVersion", () => {
  it("creates incrementing immutable snapshots and rejects immutable field updates", () => {
    const { db, cleanup } = createTestDb();

    try {
      const now = new Date("2026-06-11T00:00:00.000Z");
      db.insert(members)
        .values({
          id: "member_team_001",
          name: "团队成员 1",
          role: "member",
          createdAt: now,
        })
        .run();
      db.insert(questionnaires)
        .values({
          id: "questionnaire_001",
          title: "Draft v1",
          description: "Internal validation questionnaire",
          scenario: "major_exploration",
          createdByMemberId: "member_team_001",
          createdAt: now,
          updatedAt: now,
          currentDraftSchema: formatQuestionnaireDraft(draftWithTitle("Draft v1")),
        })
        .run();

      const firstPublish = publishQuestionnaireVersion(
        db,
        {
          questionnaireId: "questionnaire_001",
          publishNote: "First publish",
          publishedByMemberId: "member_team_001",
        },
        {
          now,
          id: "version_0000000000001",
          testToken: "testtoken000000000001",
        },
      );

      assert.equal(firstPublish.ok, true);
      assert.equal(firstPublish.version.versionNumber, 1);
      assert.equal(firstPublish.version.publishedByMemberId, "member_team_001");
      assert.equal(firstPublish.version.testToken.length, 21);
      assert.match(firstPublish.version.schemaSnapshot, /"title": "Draft v1"/);

      db.update(questionnaires)
        .set({
          currentDraftSchema: formatQuestionnaireDraft(draftWithTitle("Draft v2")),
          updatedAt: new Date("2026-06-11T01:00:00.000Z"),
        })
        .where(eq(questionnaires.id, "questionnaire_001"))
        .run();

      const secondPublish = publishQuestionnaireVersion(
        db,
        {
          questionnaireId: "questionnaire_001",
          publishNote: "Second publish",
          publishedByMemberId: "member_team_001",
        },
        {
          now: new Date("2026-06-11T01:00:00.000Z"),
          id: "version_0000000000002",
          testToken: "testtoken000000000002",
        },
      );

      assert.equal(secondPublish.ok, true);
      assert.equal(secondPublish.version.versionNumber, 2);
      assert.match(secondPublish.version.schemaSnapshot, /"title": "Draft v2"/);

      const rows = db
        .select({
          versionNumber: questionnaireVersions.versionNumber,
          schemaSnapshot: questionnaireVersions.schemaSnapshot,
        })
        .from(questionnaireVersions)
        .where(eq(questionnaireVersions.questionnaireId, "questionnaire_001"))
        .orderBy(questionnaireVersions.versionNumber)
        .all();

      assert.equal(rows.length, 2);
      assert.equal(rows[0].versionNumber, 1);
      assert.match(rows[0].schemaSnapshot, /"title": "Draft v1"/);
      assert.doesNotMatch(rows[0].schemaSnapshot, /"title": "Draft v2"/);
      assert.equal(rows[1].versionNumber, 2);

      const invalidTokenPublish = publishQuestionnaireVersion(
        db,
        {
          questionnaireId: "questionnaire_001",
          publishNote: "Invalid token override",
          publishedByMemberId: "member_team_001",
        },
        {
          testToken: "too-short",
        },
      );

      assert.equal(invalidTokenPublish.ok, false);
      assert.match(invalidTokenPublish.error, /must be 21 characters/);

      const immutableUpdate = updateQuestionnaireVersionMutableFields(db, "version_0000000000001", {
        schemaSnapshot: formatQuestionnaireDraft(draftWithTitle("Mutated")),
      });

      assert.equal(immutableUpdate.ok, false);
      assert.match(immutableUpdate.error, /Cannot update immutable questionnaire version fields: schemaSnapshot/);

      const mutableUpdate = updateQuestionnaireVersionMutableFields(db, "version_0000000000001", {
        publishNote: "Clarified first publish note",
      });

      assert.equal(mutableUpdate.ok, true);
      assert.equal(mutableUpdate.changes, 1);
    } finally {
      cleanup();
    }
  });

  it("rejects invalid saved draft schema before inserting a version", () => {
    const { db, cleanup } = createTestDb();

    try {
      const now = new Date("2026-06-11T00:00:00.000Z");
      db.insert(members)
        .values({
          id: "member_team_001",
          name: "团队成员 1",
          role: "member",
          createdAt: now,
        })
        .run();
      db.insert(questionnaires)
        .values({
          id: "questionnaire_001",
          title: "Broken draft",
          description: "",
          scenario: "",
          createdByMemberId: "member_team_001",
          createdAt: now,
          updatedAt: now,
          currentDraftSchema: "{}",
        })
        .run();

      const result = publishQuestionnaireVersion(db, {
        questionnaireId: "questionnaire_001",
        publishNote: "Should fail",
        publishedByMemberId: "member_team_001",
      });

      assert.equal(result.ok, false);
      assert.match(result.error, /title: Required/);

      const versions = db.select().from(questionnaireVersions).all();
      assert.equal(versions.length, 0);
    } finally {
      cleanup();
    }
  });

  it("retries when a concurrent publish wins the same version number", () => {
    const { db, cleanup } = createTestDb();

    try {
      const now = new Date("2026-06-11T00:00:00.000Z");
      db.insert(members)
        .values({
          id: "member_team_001",
          name: "团队成员 1",
          role: "member",
          createdAt: now,
        })
        .run();
      db.insert(questionnaires)
        .values({
          id: "questionnaire_001",
          title: "Concurrent draft",
          description: "Internal validation questionnaire",
          scenario: "major_exploration",
          createdByMemberId: "member_team_001",
          createdAt: now,
          updatedAt: now,
          currentDraftSchema: formatQuestionnaireDraft(draftWithTitle("Concurrent draft")),
        })
        .run();

      let insertedConcurrentVersion = false;
      const result = publishQuestionnaireVersion(
        db,
        {
          questionnaireId: "questionnaire_001",
          publishNote: "Publish after race",
          publishedByMemberId: "member_team_001",
        },
        {
          now,
          id: "version_0000000000009",
          testToken: "testtoken000000000009",
          beforeInsert: ({ versionNumber }) => {
            if (insertedConcurrentVersion) {
              return;
            }

            insertedConcurrentVersion = true;
            db.insert(questionnaireVersions)
              .values({
                id: "version_0000000000008",
                questionnaireId: "questionnaire_001",
                versionNumber,
                schemaSnapshot: formatQuestionnaireDraft(draftWithTitle("Concurrent winner")),
                publishedByMemberId: "member_team_001",
                publishNote: "Concurrent winner",
                testToken: "testtoken000000000008",
                testTokenMaxResponses: 50,
                testTokenResponseCount: 0,
                externalResultDetailLevel: "summary",
                createdAt: now,
              })
              .run();
          },
        },
      );

      assert.equal(result.ok, true);
      assert.equal(result.version.versionNumber, 2);

      const rows = db
        .select({
          id: questionnaireVersions.id,
          versionNumber: questionnaireVersions.versionNumber,
        })
        .from(questionnaireVersions)
        .where(eq(questionnaireVersions.questionnaireId, "questionnaire_001"))
        .orderBy(questionnaireVersions.versionNumber)
        .all();

      assert.deepEqual(rows, [
        {
          id: "version_0000000000008",
          versionNumber: 1,
        },
        {
          id: "version_0000000000009",
          versionNumber: 2,
        },
      ]);
    } finally {
      cleanup();
    }
  });
});
