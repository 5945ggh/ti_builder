import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { callAiChatCompletionCore } from "../ai/core.ts";
import * as schema from "../db/schema.ts";
import { formatQuestionnaireDraft } from "../questionnaires/draft.ts";
import { rescoreResponse } from "./rescore.ts";

const { aiCallLogs, members, questionnaireVersions, questionnaires, responses } = schema;

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "ti-builder-rescore-"));
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

function snapshotQuestionnaire() {
  return {
    title: "Snapshot Questionnaire",
    description: "Immutable published schema",
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
        title: "Snapshot Open",
        type: "open_text",
        scoringPrompt: "Score the published snapshot question.",
        scoreRange: {
          min: -2,
          max: 2,
        },
      },
    ],
    resultDebugPrompt: "Regenerate internal debug after rescore.",
  };
}

function mutableDraftQuestionnaire() {
  return {
    ...snapshotQuestionnaire(),
    title: "Mutable Draft Questionnaire",
    questions: [
      snapshotQuestionnaire().questions[0],
      {
        id: "open",
        title: "Mutable Draft Open",
        type: "open_text",
        scoringPrompt: "This mutable draft prompt must not be used for rescoring.",
        scoreRange: {
          min: -5,
          max: 5,
        },
      },
    ],
  };
}

function seedResponse(db, overrides = {}) {
  const now = new Date("2026-06-11T00:00:00.000Z");
  const schemaSnapshot = formatQuestionnaireDraft(snapshotQuestionnaire());
  const mutableDraft = formatQuestionnaireDraft(mutableDraftQuestionnaire());

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
      title: "Mutable Draft Questionnaire",
      description: "Draft has changed after publish",
      scenario: "internal",
      createdByMemberId: "member_team_001",
      createdAt: now,
      updatedAt: now,
      currentDraftSchema: mutableDraft,
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
  db.insert(responses)
    .values({
      id: "response_000000000001",
      questionnaireId: "questionnaire_001",
      versionId: "version_0000000000001",
      resultToken: "resulttoken0000000001",
      respondentName: "Alice",
      respondentNote: "Internal smoke",
      memberId: "member_team_001",
      source: "internal_member",
      submitterKey: "member_team_001",
      clientSubmissionId: "client-submission-001",
      answers: JSON.stringify({
        choice: "base",
        open: "I mapped the ambiguity and shipped a small prototype.",
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
          questionTitle: "Snapshot Open",
          questionType: "open_text",
          answer: "I mapped the ambiguity and shipped a small prototype.",
          selectedOptionIds: [],
          deltaVector: {
            clarity: -1,
            initiative: 0,
          },
          confidence: 0.3,
          rationale: "Old questionable score.",
          missing: false,
          unknownOptionIds: [],
        },
      ]),
      finalVector: JSON.stringify({
        clarity: 0,
        initiative: 0,
      }),
      debugInterpretation: "Old debug interpretation.",
      aiScoringStatus: "completed",
      createdAt: now,
      ...overrides,
    })
    .run();
}

function aiDependencies(db, fetch, idPrefix = "ai_log") {
  let idCounter = 0;
  let ticks = 0;

  return {
    db,
    env: {
      AI_API_BASE_URL: "https://ai.example.test/v1/",
      AI_API_KEY: "secret-test-key",
      AI_MODEL: "test-model",
    },
    fetch,
    now: () => new Date("2026-06-11T01:00:00.000Z"),
    monotonicNow: () => {
      ticks += 5;
      return ticks;
    },
    id: () => {
      idCounter += 1;
      return `${idPrefix}_${String(idCounter).padStart(15, "0")}`;
    },
  };
}

describe("single-response rescoring", () => {
  it("uses the immutable version snapshot, changes final vector, preserves answers, logs AI calls, and regenerates debug", async () => {
    const { db, cleanup } = createTestDb();
    const prompts = [];

    try {
      seedResponse(db);
      const dependencies = aiDependencies(db, async (_url, init) => {
        const body = JSON.parse(init.body);
        const prompt = body.messages.map((message) => message.content).join("\n");
        prompts.push(prompt);

        if (prompt.includes("Question ID: open")) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      deltaVector: {
                        clarity: 2,
                        initiative: 1,
                      },
                      confidence: 0.91,
                      rationale: "New fake score from rescore.",
                    }),
                  },
                },
              ],
            }),
          );
        }

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "New debug interpretation after rescore." } }],
          }),
        );
      });
      const result = await rescoreResponse({
        db,
        responseId: "response_000000000001",
        callAi: (input) => callAiChatCompletionCore(input, dependencies),
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "completed");
      assert.equal(result.scoredQuestionCount, 1);
      assert.equal(result.failedQuestionCount, 0);
      assert.equal(prompts.some((prompt) => prompt.includes("Snapshot Open")), true);
      assert.equal(prompts.some((prompt) => prompt.includes("Mutable Draft Open")), false);

      const row = db.select().from(responses).get();

      assert.deepEqual(JSON.parse(row.answers), {
        choice: "base",
        open: "I mapped the ambiguity and shipped a small prototype.",
      });
      assert.deepEqual(JSON.parse(row.finalVector), {
        clarity: 3,
        initiative: 1,
      });
      assert.equal(row.debugInterpretation, "New debug interpretation after rescore.");
      assert.equal(row.aiScoringStatus, "completed");
      assert.equal(row.aiScoringError, null);

      const openScore = JSON.parse(row.perQuestionScores).find((score) => score.questionId === "open");
      assert.equal(openScore.confidence, 0.91);
      assert.equal(openScore.rationale, "New fake score from rescore.");

      const logs = db.select().from(aiCallLogs).all();
      assert.equal(logs.length, 2);
      assert.deepEqual(
        logs.map((log) => [log.purpose, log.responseId, log.questionId, log.status]),
        [
          ["open_answer_scoring", "response_000000000001", "open", "success"],
          ["debug_interpretation", "response_000000000001", null, "success"],
        ],
      );
    } finally {
      cleanup();
    }
  });

  it("records AI scoring errors without deleting answers or previous scoring data when scoring cannot recompute", async () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db);

      const before = db.select().from(responses).get();
      const dependencies = aiDependencies(
        db,
        async () => new Response("temporary scoring provider outage", { status: 503 }),
        "ai_fail_log",
      );
      const result = await rescoreResponse({
        db,
        responseId: "response_000000000001",
        callAi: (input) => callAiChatCompletionCore(input, dependencies),
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "failed");
      assert.equal(result.scoredQuestionCount, 0);
      assert.equal(result.failedQuestionCount, 1);

      const row = db.select().from(responses).get();

      assert.equal(row.answers, before.answers);
      assert.notEqual(row.perQuestionScores, null);
      assert.notEqual(row.finalVector, null);
      assert.equal(row.aiScoringStatus, "failed");
      assert.match(row.aiScoringError, /open/);
      assert.match(row.aiScoringError, /HTTP 503/);

      const logs = db.select().from(aiCallLogs).all();
      assert.equal(logs.length, 2);
      assert.equal(logs.every((log) => log.status === "failure"), true);
      assert.equal(logs.every((log) => log.responseId === "response_000000000001"), true);
      assert.equal(logs.every((log) => log.questionId === "open"), true);
    } finally {
      cleanup();
    }
  });
});
