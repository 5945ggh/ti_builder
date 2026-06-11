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
import { processNextOpenAnswerResponse } from "./open-answer-scoring.ts";

const { members, questionnaireVersions, questionnaires, responses } = schema;

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "ti-builder-open-scoring-"));
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
    title: "Open scoring test",
    description: "Covers async open answers",
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
        id: "open_a",
        title: "Open A",
        type: "open_text",
        scoringPrompt: "Score clarity.",
        scoreRange: {
          min: -2,
          max: 2,
        },
      },
      {
        id: "open_b",
        title: "Open B",
        type: "open_text",
        scoringPrompt: "Score initiative.",
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
      title: "Open scoring test",
      description: "Covers async open answers",
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

function submitOpenResponse(db, overrides = {}) {
  return submitResponse(
    db,
    {
      versionId: "version_0000000000001",
      source: "internal_member",
      memberId: "member_team_001",
      submitterKey: "member_team_001",
      respondentName: "Alice",
      respondentNote: "Internal smoke",
      clientSubmissionId: "client-submission-001",
      answers: {
        choice: "base",
        open_a: "A structured answer.",
        open_b: "I started a project.",
      },
      ...overrides,
    },
    {
      id: "response_000000000001",
      resultToken: "resulttoken0000000001",
      now: new Date("2026-06-11T01:00:00.000Z"),
    },
  );
}

describe("open-answer async scoring", () => {
  it("scores multiple open questions concurrently and persists recomputed scores", async () => {
    const { db, cleanup } = createTestDb();
    const started = [];

    try {
      seedVersion(db);
      const submitted = submitOpenResponse(db);

      assert.equal(submitted.ok, true);
      assert.equal(submitted.response.aiScoringStatus, "pending");

      const result = await processNextOpenAnswerResponse({
        db,
        callAi: async (input) => {
          if (input.purpose === "debug_interpretation") {
            return {
              content: "Debug interpretation.",
              model: "fake-model",
              latencyMs: 1,
              attempts: 1,
            };
          }

          started.push({
            questionId: input.questionId,
            time: Date.now(),
          });
          await new Promise((resolve) => setTimeout(resolve, input.questionId === "open_a" ? 35 : 5));

          return {
            content:
              input.questionId === "open_a"
                ? JSON.stringify({
                    deltaVector: {
                      clarity: 2,
                    },
                    confidence: 0.8,
                    rationale: "Clear structure.",
                  })
                : JSON.stringify({
                    deltaVector: {
                      initiative: 1,
                    },
                    confidence: 0.7,
                    rationale: "Shows initiative.",
                  }),
            model: "fake-model",
            latencyMs: 1,
            attempts: 1,
          };
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "completed");
      assert.equal(result.scoredQuestionCount, 2);
      assert.equal(result.failedQuestionCount, 0);
      assert.equal(started.length, 2);
      assert.ok(Math.abs(started[0].time - started[1].time) < 20);

      const row = db.select().from(responses).get();

      assert.equal(row.aiScoringStatus, "completed");
      assert.equal(row.aiScoringError, null);
      assert.deepEqual(JSON.parse(row.finalVector), {
        clarity: 3,
        initiative: 1,
      });

      const perQuestionScores = JSON.parse(row.perQuestionScores);
      assert.equal(perQuestionScores.find((score) => score.questionId === "open_a").confidence, 0.8);
      assert.equal(perQuestionScores.find((score) => score.questionId === "open_b").rationale, "Shows initiative.");
    } finally {
      cleanup();
    }
  });

  it("marks invalid AI output partially_failed without deleting the response or answers", async () => {
    const { db, cleanup } = createTestDb();

    try {
      seedVersion(db);
      const submitted = submitOpenResponse(db);

      assert.equal(submitted.ok, true);

      const result = await processNextOpenAnswerResponse({
        db,
        callAi: async (input) => ({
          content:
            input.questionId === "open_a"
              ? JSON.stringify({
                  deltaVector: {
                    clarity: 1,
                  },
                  confidence: 0.9,
                  rationale: "Valid.",
                })
              : JSON.stringify({
                  deltaVector: {
                    unknown: 99,
                  },
                  confidence: 2,
                  rationale: "Invalid.",
                }),
          model: "fake-model",
          latencyMs: 1,
          attempts: input.questionId === "open_b" ? 2 : 1,
        }),
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "partially_failed");
      assert.equal(result.scoredQuestionCount, 1);
      assert.equal(result.failedQuestionCount, 1);

      const row = db.select().from(responses).get();

      assert.equal(row.aiScoringStatus, "partially_failed");
      assert.deepEqual(JSON.parse(row.answers), {
        choice: "base",
        open_a: "A structured answer.",
        open_b: "I started a project.",
      });
      assert.match(row.aiScoringError, /open_b/);
      assert.match(row.aiScoringError, /Unknown open scoring dimension id: unknown/);
      assert.deepEqual(JSON.parse(row.finalVector), {
        clarity: 2,
        initiative: 0,
      });
    } finally {
      cleanup();
    }
  });

  it("retries invalid AI output once and completes when the retry is valid", async () => {
    const { db, cleanup } = createTestDb();
    const callsByQuestion = new Map();

    try {
      seedVersion(db);
      submitOpenResponse(db);

      const result = await processNextOpenAnswerResponse({
        db,
        callAi: async (input) => {
          callsByQuestion.set(input.questionId, (callsByQuestion.get(input.questionId) ?? 0) + 1);

          if (input.questionId === "open_a" && callsByQuestion.get(input.questionId) === 1) {
            return {
              content: "{not valid json",
              model: "fake-model",
              latencyMs: 1,
              attempts: 1,
            };
          }

          return {
            content:
              input.questionId === "open_a"
                ? JSON.stringify({
                    deltaVector: {
                      clarity: 2,
                    },
                    confidence: 0.9,
                    rationale: "Recovered on retry.",
                  })
                : JSON.stringify({
                    deltaVector: {
                      initiative: 1,
                    },
                    confidence: 0.7,
                    rationale: "Valid first try.",
                  }),
            model: "fake-model",
            latencyMs: 1,
            attempts: 1,
          };
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "completed");
      assert.equal(callsByQuestion.get("open_a"), 2);
      assert.equal(callsByQuestion.get("open_b"), 1);

      const row = db.select().from(responses).get();

      assert.equal(row.aiScoringStatus, "completed");
      assert.equal(row.aiScoringError, null);
      assert.deepEqual(JSON.parse(row.finalVector), {
        clarity: 3,
        initiative: 1,
      });
      assert.match(
        JSON.parse(row.perQuestionScores).find((score) => score.questionId === "open_a").rationale,
        /Recovered/,
      );
    } finally {
      cleanup();
    }
  });

  it("marks a question failed only after both invalid AI output attempts fail", async () => {
    const { db, cleanup } = createTestDb();
    const callsByQuestion = new Map();

    try {
      seedVersion(db);
      submitOpenResponse(db);

      const result = await processNextOpenAnswerResponse({
        db,
        callAi: async (input) => {
          callsByQuestion.set(input.questionId, (callsByQuestion.get(input.questionId) ?? 0) + 1);

          return {
            content:
              input.questionId === "open_a"
                ? JSON.stringify({
                    deltaVector: {
                      clarity: 1,
                    },
                    confidence: 0.9,
                    rationale: "Valid.",
                  })
                : JSON.stringify({
                    deltaVector: {
                      unknown: 99,
                    },
                    confidence: 2,
                    rationale: "Invalid.",
                  }),
            model: "fake-model",
            latencyMs: 1,
            attempts: 1,
          };
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "partially_failed");
      assert.equal(callsByQuestion.get("open_a"), 1);
      assert.equal(callsByQuestion.get("open_b"), 2);

      const row = db.select().from(responses).get();

      assert.equal(row.aiScoringStatus, "partially_failed");
      assert.match(row.aiScoringError, /open_b/);
      assert.match(row.aiScoringError, /Unknown open scoring dimension id: unknown/);
      assert.deepEqual(JSON.parse(row.answers).open_b, "I started a project.");
    } finally {
      cleanup();
    }
  });

  it("marks a response failed when all open question scoring fails", async () => {
    const { db, cleanup } = createTestDb();

    try {
      seedVersion(db);
      submitOpenResponse(db);

      const result = await processNextOpenAnswerResponse({
        db,
        callAi: async () => ({
          content: "{not valid json",
          model: "fake-model",
          latencyMs: 1,
          attempts: 2,
        }),
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "failed");
      assert.equal(result.scoredQuestionCount, 0);
      assert.equal(result.failedQuestionCount, 2);

      const row = db.select().from(responses).get();

      assert.equal(row.aiScoringStatus, "failed");
      assert.equal(JSON.parse(row.perQuestionScores).length, 3);
      assert.deepEqual(JSON.parse(row.finalVector), {
        clarity: 1,
        initiative: 0,
      });
      assert.deepEqual(JSON.parse(row.answers).open_b, "I started a project.");
    } finally {
      cleanup();
    }
  });
});
