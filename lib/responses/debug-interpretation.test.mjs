import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";
import { formatQuestionnaireDraft } from "../questionnaires/draft.ts";
import {
  buildDebugInterpretationMessages,
  generateDebugInterpretationForResponse,
  processNextDebugInterpretationResponse,
} from "./debug-interpretation.ts";

const { members, questionnaireVersions, questionnaires, responses } = schema;

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "ti-builder-debug-interpretation-"));
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
    title: "Debug Interpretation Test",
    description: "Checks debug prompt assembly",
    scenario: "internal validation",
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
      {
        id: "risk",
        name: "Risk",
        description: "Comfort with uncertainty",
      },
    ],
    questions: [
      {
        id: "choice",
        title: "Preferred work style",
        type: "single_choice",
        options: [
          {
            id: "structured",
            label: "Structured",
            deltaVector: {
              clarity: 2,
              risk: -1,
            },
          },
        ],
      },
      {
        id: "open",
        title: "Describe a project",
        type: "open_text",
        scoringPrompt: "Score clarity and initiative.",
        scoreRange: {
          min: -2,
          max: 2,
        },
      },
    ],
    resultDebugPrompt: "Call out unstable dimensions and wording improvements for internal review.",
  };
}

function seedResponse(db, overrides = {}) {
  const now = new Date("2026-06-11T00:00:00.000Z");
  const schemaSnapshot = formatQuestionnaireDraft(questionnaire());

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
      title: "Debug Interpretation Test",
      description: "Checks debug prompt assembly",
      scenario: "internal validation",
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
        choice: "structured",
        open: "I mapped the ambiguous parts first, then built a small prototype.",
      }),
      perQuestionScores: JSON.stringify([
        {
          questionId: "choice",
          questionTitle: "Preferred work style",
          questionType: "single_choice",
          answer: "structured",
          selectedOptionIds: ["structured"],
          deltaVector: {
            clarity: 2,
            initiative: 0,
            risk: -1,
          },
          missing: false,
          unknownOptionIds: [],
        },
        {
          questionId: "open",
          questionTitle: "Describe a project",
          questionType: "open_text",
          answer: "I mapped the ambiguous parts first, then built a small prototype.",
          selectedOptionIds: [],
          deltaVector: {
            clarity: 1,
            initiative: 2,
            risk: 0,
          },
          confidence: 0.82,
          rationale: "The answer shows planning and initiative.",
          missing: false,
          unknownOptionIds: [],
        },
      ]),
      finalVector: JSON.stringify({
        clarity: 3,
        initiative: 2,
        risk: -1,
      }),
      aiScoringStatus: "completed",
      createdAt: now,
      ...overrides,
    })
    .run();
}

describe("debug interpretation", () => {
  it("builds a prompt with required inputs and non-diagnostic instructions", () => {
    const messages = buildDebugInterpretationMessages({
      questionnaire: questionnaire(),
      answers: {
        choice: "structured",
        open: "I mapped the ambiguous parts first, then built a small prototype.",
      },
      perQuestionScores: [
        {
          questionId: "open",
          questionTitle: "Describe a project",
          questionType: "open_text",
          answer: "I mapped the ambiguous parts first, then built a small prototype.",
          selectedOptionIds: [],
          deltaVector: {
            clarity: 1,
            initiative: 2,
            risk: 0,
          },
          confidence: 0.82,
          rationale: "The answer shows planning and initiative.",
          missing: false,
          unknownOptionIds: [],
        },
      ],
      finalVector: {
        clarity: 3,
        initiative: 2,
        risk: -1,
      },
    });

    assert.match(messages[0].content, /Do not present a scientific diagnosis/);
    assert.match(messages[0].content, /Do not give deterministic school, major, career/);
    assert.match(messages[1].content, /Questionnaire title: Debug Interpretation Test/);
    assert.match(messages[1].content, /Dimensions:/);
    assert.match(messages[1].content, /Final vector:/);
    assert.match(messages[1].content, /Top dimensions:/);
    assert.match(messages[1].content, /Bottom dimensions:/);
    assert.match(messages[1].content, /Structured \(structured\)/);
    assert.match(messages[1].content, /I mapped the ambiguous parts first/);
    assert.match(messages[1].content, /The answer shows planning and initiative/);
    assert.match(messages[1].content, /Call out unstable dimensions/);
  });

  it("generates and persists debug interpretation for completed responses with final vector", async () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db);

      const result = await processNextDebugInterpretationResponse({
        db,
        callAi: async (input) => {
          assert.equal(input.purpose, "debug_interpretation");
          assert.equal(input.responseId, "response_000000000001");
          assert.equal(input.thinking, "enabled");
          assert.match(input.messages[1].content, /Final vector:/);

          return {
            content: "Readable debug interpretation with highlights and instability signals.",
            model: "fake-model",
            latencyMs: 1,
            attempts: 1,
          };
        },
      });

      assert.equal(result.ok, true);

      const row = db.select().from(responses).get();

      assert.equal(row.aiScoringStatus, "completed");
      assert.equal(row.aiScoringError, null);
      assert.equal(row.debugInterpretation, "Readable debug interpretation with highlights and instability signals.");
    } finally {
      cleanup();
    }
  });

  it("resumes a stuck generating_debug_interpretation response with final vector", async () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db, {
        aiScoringStatus: "generating_debug_interpretation",
        debugInterpretation: null,
      });

      const result = await processNextDebugInterpretationResponse({
        db,
        callAi: async (input) => {
          assert.equal(input.purpose, "debug_interpretation");
          assert.equal(input.responseId, "response_000000000001");

          return {
            content: "Resumed debug interpretation.",
            model: "fake-model",
            latencyMs: 1,
            attempts: 1,
          };
        },
      });

      assert.equal(result.ok, true);

      const row = db.select().from(responses).get();

      assert.equal(row.aiScoringStatus, "completed");
      assert.equal(row.aiScoringError, null);
      assert.equal(row.debugInterpretation, "Resumed debug interpretation.");
    } finally {
      cleanup();
    }
  });

  it("preserves a claimed row's original final status when resumed", async () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db, {
        aiScoringStatus: "partially_failed",
        aiScoringError: JSON.stringify({
          open: {
            status: "failed",
            error: "open answer unavailable",
          },
        }),
      });

      const firstResult = await generateDebugInterpretationForResponse({
        db,
        responseId: "response_000000000001",
        finalStatus: "partially_failed",
        callAi: async () => {
          throw new Error("process crashed before persistence");
        },
      });

      assert.equal(firstResult.ok, false);

      const stuckRow = db.select().from(responses).get();
      assert.equal(stuckRow.aiScoringStatus, "partially_failed");
      assert.match(stuckRow.aiScoringError, /debug_interpretation/);

      db.update(responses)
        .set({
          aiScoringStatus: "generating_debug_interpretation",
          debugInterpretation: null,
          aiScoringError: JSON.stringify({
            open: {
              status: "failed",
              error: "open answer unavailable",
            },
            debug_interpretation_claim: {
              finalStatus: "partially_failed",
            },
          }),
        })
        .run();

      const resumedResult = await processNextDebugInterpretationResponse({
        db,
        callAi: async () => ({
          content: "Resumed partial debug interpretation.",
          model: "fake-model",
          latencyMs: 1,
          attempts: 1,
        }),
      });

      assert.equal(resumedResult.ok, true);

      const row = db.select().from(responses).get();

      assert.equal(row.aiScoringStatus, "partially_failed");
      assert.equal(row.debugInterpretation, "Resumed partial debug interpretation.");
      assert.deepEqual(JSON.parse(row.aiScoringError), {
        open: {
          status: "failed",
          error: "open answer unavailable",
        },
      });
    } finally {
      cleanup();
    }
  });

  it("records debug failure without erasing scoring results", async () => {
    const { db, cleanup } = createTestDb();

    try {
      seedResponse(db);

      const result = await generateDebugInterpretationForResponse({
        db,
        responseId: "response_000000000001",
        finalStatus: "completed",
        callAi: async () => {
          throw new Error("debug provider unavailable");
        },
      });

      assert.equal(result.ok, false);

      const row = db.select().from(responses).get();

      assert.equal(row.aiScoringStatus, "completed");
      assert.equal(row.debugInterpretation, null);
      assert.deepEqual(JSON.parse(row.finalVector), {
        clarity: 3,
        initiative: 2,
        risk: -1,
      });
      assert.equal(JSON.parse(row.perQuestionScores).length, 2);
      assert.match(row.aiScoringError, /debug_interpretation/);
      assert.match(row.aiScoringError, /debug provider unavailable/);
    } finally {
      cleanup();
    }
  });
});
