import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";
import { submitFeedback } from "./feedback.ts";

const { feedback, members, questionnaireVersions, questionnaires, responses } = schema;

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "ti-builder-feedback-"));
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

    CREATE TABLE feedback (
      id text PRIMARY KEY NOT NULL,
      response_id text NOT NULL,
      interest_score integer NOT NULL,
      accuracy_score integer NOT NULL,
      share_willingness_score integer NOT NULL,
      usefulness_score integer NOT NULL,
      comment text DEFAULT '' NOT NULL,
      question_comments text,
      created_at integer NOT NULL
    );

    CREATE UNIQUE INDEX feedback_response_unique ON feedback (response_id);
  `);

  return {
    db: drizzle(sqlite, { schema }),
    cleanup() {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function seedResponse(db, overrides = {}) {
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
      title: "Feedback Questionnaire",
      description: "Collect feedback",
      scenario: "internal",
      createdByMemberId: "member_team_001",
      createdAt: now,
      updatedAt: now,
      currentDraftSchema: "{}",
    })
    .run();
  db.insert(questionnaireVersions)
    .values({
      id: "version_0000000000001",
      questionnaireId: "questionnaire_001",
      versionNumber: 1,
      schemaSnapshot: "{}",
      publishedByMemberId: "member_team_001",
      publishNote: "Initial",
      testToken: "testtoken000000000001",
      testTokenMaxResponses: 50,
      testTokenResponseCount: 0,
      externalResultDetailLevel: "summary",
      createdAt: now,
    })
    .run();
  db.insert(responses)
    .values({
      id: "response_000000000001",
      questionnaireId: "questionnaire_001",
      versionId: "version_0000000000001",
      resultToken: "resulttoken0000000001",
      respondentName: "Alice",
      respondentNote: "Keep my scores unchanged",
      memberId: "member_team_001",
      source: "internal_member",
      submitterKey: "member_team_001",
      clientSubmissionId: "client-submission-001",
      answers: JSON.stringify({
        q1: "a",
      }),
      perQuestionScores: JSON.stringify([
        {
          questionId: "q1",
          deltaVector: {
            clarity: 2,
          },
        },
      ]),
      finalVector: JSON.stringify({
        clarity: 2,
      }),
      debugInterpretation: "Existing debug.",
      aiScoringStatus: "completed",
      createdAt: now,
      ...overrides,
    })
    .run();
}

function validFeedback(overrides = {}) {
  return {
    resultToken: "resulttoken0000000001",
    interestScore: 4,
    accuracyScore: 5,
    shareWillingnessScore: 3,
    usefulnessScore: 4,
    comment: " Helpful result. ",
    ...overrides,
  };
}

describe("submitFeedback", () => {
  it("creates feedback for the response addressed by result token", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db);

      const result = submitFeedback(db, validFeedback(), {
        id: "feedback_000000000001",
        now: new Date("2026-06-11T01:00:00.000Z"),
      });

      assert.equal(result.ok, true);
      assert.equal(result.feedback.responseId, "response_000000000001");
      assert.equal(result.feedback.updated, false);

      const row = db.select().from(feedback).get();
      assert.equal(row.id, "feedback_000000000001");
      assert.equal(row.responseId, "response_000000000001");
      assert.equal(row.interestScore, 4);
      assert.equal(row.accuracyScore, 5);
      assert.equal(row.shareWillingnessScore, 3);
      assert.equal(row.usefulnessScore, 4);
      assert.equal(row.comment, "Helpful result.");
      assert.equal(row.questionComments, null);
    } finally {
      cleanup();
    }
  });

  it("rejects scores outside the 1-5 range before writing", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db);

      const result = submitFeedback(db, validFeedback({ interestScore: 0, usefulnessScore: 6 }));

      assert.equal(result.ok, false);
      assert.match(result.error, /greater than or equal to 1/);
      assert.match(result.error, /less than or equal to 5/);
      assert.equal(db.select().from(feedback).all().length, 0);
    } finally {
      cleanup();
    }
  });

  it("rejects an unknown result token without creating feedback", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db);

      const result = submitFeedback(db, validFeedback({ resultToken: "wrong-token" }));

      assert.deepEqual(result, {
        ok: false,
        error: "Result not found.",
      });
      assert.equal(db.select().from(feedback).all().length, 0);
    } finally {
      cleanup();
    }
  });

  it("updates the existing feedback row for duplicate submits on the same result token", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db);

      const first = submitFeedback(db, validFeedback(), {
        id: "feedback_000000000001",
        now: new Date("2026-06-11T01:00:00.000Z"),
      });
      const second = submitFeedback(
        db,
        validFeedback({
          interestScore: 2,
          accuracyScore: 3,
          shareWillingnessScore: 1,
          usefulnessScore: 5,
          comment: "Edited after reading again.",
        }),
        {
          id: "feedback_000000000002",
          now: new Date("2026-06-11T02:00:00.000Z"),
        },
      );

      assert.equal(first.ok, true);
      assert.equal(second.ok, true);
      assert.equal(second.feedback.id, "feedback_000000000001");
      assert.equal(second.feedback.updated, true);

      const rows = db.select().from(feedback).all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, "feedback_000000000001");
      assert.equal(rows[0].responseId, "response_000000000001");
      assert.equal(rows[0].interestScore, 2);
      assert.equal(rows[0].accuracyScore, 3);
      assert.equal(rows[0].shareWillingnessScore, 1);
      assert.equal(rows[0].usefulnessScore, 5);
      assert.equal(rows[0].comment, "Edited after reading again.");
    } finally {
      cleanup();
    }
  });

  it("does not mutate response answers or scoring data when feedback is submitted", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db);
      const before = db.select().from(responses).get();

      const result = submitFeedback(db, validFeedback(), {
        id: "feedback_000000000001",
      });

      assert.equal(result.ok, true);

      const after = db.select().from(responses).get();
      assert.equal(after.answers, before.answers);
      assert.equal(after.perQuestionScores, before.perQuestionScores);
      assert.equal(after.finalVector, before.finalVector);
      assert.equal(after.debugInterpretation, before.debugInterpretation);
      assert.equal(after.aiScoringStatus, before.aiScoringStatus);
      assert.equal(after.aiScoringError, before.aiScoringError);
    } finally {
      cleanup();
    }
  });
});
