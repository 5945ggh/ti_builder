import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";
import { formatQuestionnaireDraft } from "../questionnaires/draft.ts";
import { buildResponseJsonExport } from "./response-export.ts";

const { aiCallLogs, feedback, members, questionnaireVersions, questionnaires, responses } = schema;

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "ti-builder-export-"));
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

    CREATE TABLE ai_call_logs (
      id text PRIMARY KEY NOT NULL,
      purpose text NOT NULL,
      response_id text,
      question_id text,
      input_summary text DEFAULT '' NOT NULL,
      output text,
      status text NOT NULL,
      error text,
      created_at integer NOT NULL
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

function questionnaire() {
  return {
    title: "Export Questionnaire",
    description: "Immutable export snapshot",
    scenario: "internal",
    dimensions: [
      {
        id: "clarity",
        name: "Clarity",
        description: "Clear structured thinking",
      },
      {
        id: "initiative",
        name: "Initiative",
        description: "Self-directed action",
      },
    ],
    questions: [
      {
        id: "choice",
        title: "Choice",
        type: "single_choice",
        options: [
          {
            id: "base",
            label: "Base",
            deltaVector: {
              clarity: 1,
            },
          },
        ],
      },
      {
        id: "open",
        title: "Open",
        type: "open_text",
        scoringPrompt: "Score export answer.",
        scoreRange: {
          min: -2,
          max: 2,
        },
      },
    ],
    resultDebugPrompt: "Explain the export result.",
  };
}

function seedResponse(db) {
  const now = new Date("2026-06-11T00:00:00.000Z");
  const later = new Date("2026-06-11T01:00:00.000Z");

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
      title: "Mutable Export Draft",
      description: "Draft metadata",
      scenario: "internal",
      createdByMemberId: "member_team_001",
      createdAt: now,
      updatedAt: later,
      currentDraftSchema: "{}",
    })
    .run();
  db.insert(questionnaireVersions)
    .values({
      id: "version_0000000000001",
      questionnaireId: "questionnaire_001",
      versionNumber: 3,
      schemaSnapshot: formatQuestionnaireDraft(questionnaire()),
      publishedByMemberId: "member_team_001",
      publishNote: "Exportable immutable snapshot",
      testToken: "test_token_must_not_export",
      testTokenMaxResponses: 50,
      testTokenResponseCount: 1,
      externalResultDetailLevel: "detailed",
      createdAt: now,
    })
    .run();
  db.insert(responses)
    .values({
      id: "response_000000000001",
      questionnaireId: "questionnaire_001",
      versionId: "version_0000000000001",
      resultToken: "result_token_must_not_export",
      respondentName: "Alice",
      respondentNote: "Internal smoke",
      memberId: "member_team_001",
      source: "internal_member",
      submitterKey: "submitter_key_must_not_export",
      clientSubmissionId: "client_submission_must_not_export",
      answers: JSON.stringify({
        choice: "base",
        open: "I mapped ambiguity and shipped.",
      }),
      perQuestionScores: JSON.stringify([
        {
          questionId: "choice",
          questionTitle: "Choice",
          questionType: "single_choice",
          answer: "base",
          selectedOptionIds: ["base"],
          deltaVector: {
            clarity: 1,
            initiative: 0,
          },
          missing: false,
          unknownOptionIds: [],
        },
        {
          questionId: "open",
          questionTitle: "Open",
          questionType: "open_text",
          answer: "I mapped ambiguity and shipped.",
          selectedOptionIds: [],
          deltaVector: {
            clarity: 2,
            initiative: 1,
          },
          confidence: 0.88,
          rationale: "Existing sanitized AI rationale.",
          missing: false,
          unknownOptionIds: [],
        },
      ]),
      finalVector: JSON.stringify({
        clarity: 3,
        initiative: 1,
      }),
      debugInterpretation: "Debug interpretation from sanitized stored response field.",
      aiScoringStatus: "completed",
      aiScoringError: null,
      createdAt: later,
    })
    .run();
  db.insert(feedback)
    .values({
      id: "feedback_0000000000001",
      responseId: "response_000000000001",
      interestScore: 5,
      accuracyScore: 4,
      shareWillingnessScore: 3,
      usefulnessScore: 5,
      comment: "Useful feedback.",
      questionComments: null,
      createdAt: later,
    })
    .run();
  db.insert(aiCallLogs)
    .values([
      {
        id: "ai_log_0000000000001",
        purpose: "open_answer_scoring",
        responseId: "response_000000000001",
        questionId: "open",
        inputSummary: "Open answer scoring for response response_000000000001, question open",
        output: '{"deltaVector":{"clarity":2,"initiative":1},"confidence":0.88,"rationale":"Existing sanitized AI rationale."}',
        status: "success",
        error: null,
        createdAt: now,
      },
      {
        id: "ai_log_0000000000002",
        purpose: "debug_interpretation",
        responseId: "response_000000000001",
        questionId: null,
        inputSummary: "Debug interpretation for response response_000000000001",
        output: "Debug interpretation from sanitized stored response field.",
        status: "success",
        error: null,
        createdAt: later,
      },
    ])
    .run();
}

describe("response JSON export", () => {
  it("exports enough immutable response data to reconstruct interpretation without operational secrets", () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db);

      const result = buildResponseJsonExport(db, "response_000000000001", {
        exportedAt: new Date("2026-06-11T02:00:00.000Z"),
      });

      assert.equal(result.ok, true);

      const exported = result.export;

      assert.equal(exported.exportedAt, "2026-06-11T02:00:00.000Z");
      assert.deepEqual(exported.response, {
        id: "response_000000000001",
        questionnaireId: "questionnaire_001",
        versionId: "version_0000000000001",
        respondentName: "Alice",
        respondentNote: "Internal smoke",
        memberId: "member_team_001",
        memberName: "团队成员 1",
        source: "internal_member",
        createdAt: "2026-06-11T01:00:00.000Z",
      });
      assert.equal(exported.questionnaireVersion.versionNumber, 3);
      assert.equal(exported.questionnaireVersion.schemaSnapshot.title, "Export Questionnaire");
      assert.equal(exported.questionnaireVersion.schemaSnapshot.questions[1].scoringPrompt, "Score export answer.");
      assert.deepEqual(exported.interpretationData.answers, {
        choice: "base",
        open: "I mapped ambiguity and shipped.",
      });
      assert.equal(exported.interpretationData.perQuestionScores[1].confidence, 0.88);
      assert.deepEqual(exported.interpretationData.finalVector, {
        clarity: 3,
        initiative: 1,
      });
      assert.equal(
        exported.interpretationData.debugInterpretation,
        "Debug interpretation from sanitized stored response field.",
      );
      assert.equal(exported.interpretationData.aiScoringStatus, "completed");
      assert.equal(exported.interpretationData.aiScoringError, null);
      assert.deepEqual(
        exported.interpretationData.aiCallLogs.map((log) => [log.purpose, log.questionId, log.status]),
        [
          ["open_answer_scoring", "open", "success"],
          ["debug_interpretation", null, "success"],
        ],
      );
      assert.equal(exported.feedback.interestScore, 5);
      assert.equal(exported.feedback.comment, "Useful feedback.");

      const serialized = JSON.stringify(exported);

      assert.equal(serialized.includes("AI_API_KEY"), false);
      assert.equal(serialized.includes("authorization"), false);
      assert.equal(serialized.includes("cookie"), false);
      assert.equal(serialized.includes("session"), false);
      assert.equal(serialized.includes("test_token_must_not_export"), false);
      assert.equal(serialized.includes("result_token_must_not_export"), false);
      assert.equal(serialized.includes("submitter_key_must_not_export"), false);
      assert.equal(serialized.includes("client_submission_must_not_export"), false);
    } finally {
      cleanup();
    }
  });

  it("returns not_found for unknown responses", () => {
    const { db, cleanup } = createTestDb();

    try {
      assert.deepEqual(buildResponseJsonExport(db, "missing_response"), {
        ok: false,
        error: "not_found",
      });
    } finally {
      cleanup();
    }
  });
});
