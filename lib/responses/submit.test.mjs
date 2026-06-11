import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";
import { formatQuestionnaireDraft } from "../questionnaires/draft.ts";
import { submitResponse } from "./submit.ts";

const { members, questionnaireVersions, questionnaires, responses } = schema;

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "ti-builder-response-"));
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
      internal_note text DEFAULT '' NOT NULL
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
      created_at integer NOT NULL
    );

    CREATE TABLE responses (
      id text PRIMARY KEY NOT NULL,
      questionnaire_id text NOT NULL,
      version_id text NOT NULL,
      result_token text NOT NULL,
      respondent_name text NOT NULL,
      respondent_note text DEFAULT '' NOT NULL,
      member_id text,
      source text NOT NULL,
      submitter_key text NOT NULL,
      client_submission_id text NOT NULL,
      answers text NOT NULL,
      per_question_scores text,
      final_vector text,
      debug_interpretation text,
      ai_scoring_status text DEFAULT 'pending' NOT NULL,
      ai_scoring_error text,
      created_at integer NOT NULL
    );

    CREATE UNIQUE INDEX responses_result_token_unique ON responses (result_token);
    CREATE UNIQUE INDEX responses_version_source_submitter_client_submission_unique
      ON responses (version_id, source, submitter_key, client_submission_id);
  `);

  return {
    db: drizzle(sqlite, { schema }),
    cleanup() {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function questionnaire() {
  return {
    title: "Internal answer test",
    description: "Covers answer shapes",
    scenario: "internal",
    dimensions: [
      {
        id: "primary",
        name: "Primary",
        description: "Primary dimension",
      },
    ],
    questions: [
      {
        id: "single",
        title: "Single choice",
        type: "single_choice",
        options: [
          {
            id: "a",
            label: "A",
            deltaVector: {
              primary: 1,
            },
          },
          {
            id: "b",
            label: "B",
            deltaVector: {
              primary: -1,
            },
          },
        ],
      },
      {
        id: "multi",
        title: "Multiple choice",
        type: "multiple_choice",
        options: [
          {
            id: "m1",
            label: "M1",
            deltaVector: {
              primary: 1,
            },
          },
          {
            id: "m2",
            label: "M2",
            deltaVector: {
              primary: 2,
            },
          },
        ],
      },
      {
        id: "open",
        title: "Open text",
        type: "open_text",
        scoringPrompt: "Score clarity.",
        scoreRange: {
          min: -2,
          max: 2,
        },
      },
    ],
    resultDebugPrompt: "",
  };
}

function seedVersion(db, schemaSnapshot = formatQuestionnaireDraft(questionnaire())) {
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
      title: "Internal answer test",
      description: "Covers answer shapes",
      scenario: "internal",
      createdByMemberId: "member_team_001",
      createdAt: now,
      updatedAt: now,
      currentDraftSchema: schemaSnapshot,
    })
    .run();
  db.insert(questionnaireVersions)
    .values({
      id: "version_0000000000001",
      questionnaireId: "questionnaire_001",
      versionNumber: 1,
      schemaSnapshot,
      publishedByMemberId: "member_team_001",
      publishNote: "Initial",
      testToken: "testtoken000000000001",
      testTokenMaxResponses: 50,
      testTokenResponseCount: 0,
      externalResultDetailLevel: "summary",
      createdAt: now,
    })
    .run();
}

const baseInput = {
  versionId: "version_0000000000001",
  source: "internal_member",
  memberId: "member_team_001",
  submitterKey: "member_team_001",
  respondentName: "Alice",
  respondentNote: "Internal smoke",
  clientSubmissionId: "client-submission-001",
  answers: {
    single: "a",
    multi: ["m1", "m2"],
    open: "I like structured exploration.",
  },
};

describe("submitResponse", () => {
  it("creates an internal response for a published version and accepts all answer shapes", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedVersion(db);
      const result = submitResponse(db, baseInput, {
        id: "response_000000000001",
        resultToken: "resulttoken0000000001",
        now: new Date("2026-06-11T01:00:00.000Z"),
      });

      assert.equal(result.ok, true);
      assert.equal(result.response.id, "response_000000000001");
      assert.equal(result.response.resultToken.length, 21);
      assert.equal(result.response.aiScoringStatus, "pending");
      assert.equal(result.response.created, true);

      const rows = db.select().from(responses).all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].versionId, "version_0000000000001");
      assert.equal(rows[0].memberId, "member_team_001");
      assert.equal(rows[0].submitterKey, "member_team_001");
      assert.deepEqual(JSON.parse(rows[0].answers), baseInput.answers);
    } finally {
      cleanup();
    }
  });

  it("returns the existing response for duplicate idempotent submissions", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedVersion(db);
      const first = submitResponse(db, baseInput, {
        id: "response_000000000001",
        resultToken: "resulttoken0000000001",
      });
      const second = submitResponse(db, baseInput, {
        id: "response_000000000002",
        resultToken: "resulttoken0000000002",
      });

      assert.equal(first.ok, true);
      assert.equal(second.ok, true);
      assert.equal(second.response.created, false);
      assert.equal(second.response.id, first.response.id);
      assert.equal(second.response.resultToken, first.response.resultToken);

      const rows = db.select().from(responses).all();
      assert.equal(rows.length, 1);
    } finally {
      cleanup();
    }
  });

  it("rejects unknown option IDs", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedVersion(db);
      const result = submitResponse(db, {
        ...baseInput,
        answers: {
          ...baseInput.answers,
          single: "missing",
        },
      });

      assert.equal(result.ok, false);
      assert.match(result.error, /Unknown option for single: missing/);
      assert.equal(db.select().from(responses).all().length, 0);
    } finally {
      cleanup();
    }
  });

  it("rejects duplicate multiple-choice option IDs", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedVersion(db);
      const result = submitResponse(db, {
        ...baseInput,
        answers: {
          ...baseInput.answers,
          multi: ["m1", "m1"],
        },
      });

      assert.equal(result.ok, false);
      assert.match(result.error, /Duplicate option IDs for multi are not allowed/);
      assert.equal(db.select().from(responses).all().length, 0);
    } finally {
      cleanup();
    }
  });

  it("rejects answer keys outside the published schema", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedVersion(db);
      const result = submitResponse(db, {
        ...baseInput,
        answers: {
          ...baseInput.answers,
          extra: "not in the schema",
        },
      });

      assert.equal(result.ok, false);
      assert.match(result.error, /Unknown answer question id: extra/);
      assert.equal(db.select().from(responses).all().length, 0);
    } finally {
      cleanup();
    }
  });

  it("marks choice-only questionnaires completed without AI work", () => {
    const { db, cleanup } = createTestDb();

    try {
      const choiceOnly = {
        ...questionnaire(),
        questions: questionnaire().questions.filter((question) => question.type !== "open_text"),
      };
      seedVersion(db, formatQuestionnaireDraft(choiceOnly));
      const result = submitResponse(db, {
        ...baseInput,
        answers: {
          single: "a",
          multi: ["m1"],
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.response.aiScoringStatus, "completed");

      const row = db.select().from(responses).get();

      assert.deepEqual(JSON.parse(row.perQuestionScores), [
        {
          questionId: "single",
          questionTitle: "Single choice",
          questionType: "single_choice",
          answer: "a",
          selectedOptionIds: ["a"],
          deltaVector: {
            primary: 1,
          },
          missing: false,
          unknownOptionIds: [],
        },
        {
          questionId: "multi",
          questionTitle: "Multiple choice",
          questionType: "multiple_choice",
          answer: ["m1"],
          selectedOptionIds: ["m1"],
          deltaVector: {
            primary: 1,
          },
          missing: false,
          unknownOptionIds: [],
        },
      ]);
      assert.deepEqual(JSON.parse(row.finalVector), {
        primary: 2,
      });
    } finally {
      cleanup();
    }
  });

  it("does not treat result token uniqueness as an idempotent retry", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedVersion(db);
      const first = submitResponse(db, baseInput, {
        id: "response_000000000001",
        resultToken: "resulttoken0000000001",
      });

      assert.equal(first.ok, true);
      assert.throws(
        () =>
          submitResponse(
            db,
            {
              ...baseInput,
              clientSubmissionId: "client-submission-002",
            },
            {
              id: "response_000000000002",
              resultToken: "resulttoken0000000001",
            },
          ),
        /UNIQUE constraint failed: responses.result_token/,
      );

      const rows = db.select().from(responses).all();
      assert.equal(rows.length, 1);
    } finally {
      cleanup();
    }
  });
});
