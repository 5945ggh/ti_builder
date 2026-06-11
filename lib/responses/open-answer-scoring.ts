import { and, eq, inArray } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { questionnaireVersions, responses, type AiScoringStatus } from "../db/schema.ts";
import { parseAiJsonWithSchema } from "../ai/core.ts";
import type { AiChatCompletionInput, AiChatCompletionResult } from "../ai/core.ts";
import { scoreQuestionnaire, type OpenAnswerScores, type QuestionnaireAnswers } from "../scoring/engine.ts";
import {
  createOpenAnswerScoringOutputSchema,
  parseQuestionnaireSchema,
  type OpenAnswerScoringOutput,
  type OpenTextQuestion,
  type QuestionnaireSchema,
} from "../schema/questionnaire.ts";
import { generateDebugInterpretationForResponse } from "./debug-interpretation.ts";

export type OpenAnswerAiCaller = (input: AiChatCompletionInput) => Promise<AiChatCompletionResult>;

export type ScoreOpenAnswerResponseResult =
  | {
      ok: true;
      responseId: string;
      status: Extract<AiScoringStatus, "completed" | "partially_failed" | "failed">;
      scoredQuestionCount: number;
      failedQuestionCount: number;
    }
  | {
      ok: false;
      responseId: string;
      error: string;
    };

type PendingResponseRow = {
  responseId: string;
  versionId: string;
  answers: string;
  schemaSnapshot: string;
};

type QuestionScoreResult =
  | {
      questionId: string;
      ok: true;
      score: OpenAnswerScoringOutput;
    }
  | {
      questionId: string;
      ok: false;
      error: string;
    };

const claimableStatuses = ["pending", "scoring_open_answers"] as const satisfies AiScoringStatus[];

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 1_000);
  }

  return String(error).slice(0, 1_000);
}

function parseAnswers(raw: string): QuestionnaireAnswers {
  return JSON.parse(raw) as QuestionnaireAnswers;
}

function findOpenQuestions(questionnaire: QuestionnaireSchema): OpenTextQuestion[] {
  return questionnaire.questions.filter((question): question is OpenTextQuestion => question.type === "open_text");
}

function buildOpenAnswerMessages(input: {
  questionnaire: QuestionnaireSchema;
  question: OpenTextQuestion;
  answer: string;
}) {
  return [
    {
      role: "system" as const,
      content:
        "You score one open-answer questionnaire response. Return only JSON and no markdown. The JSON shape is exactly {\"deltaVector\": Record<string, number>, \"confidence\": number, \"rationale\": string}. Use only known dimension IDs. Each deltaVector value must be within the question scoreRange. Do not diagnose the respondent or make deterministic school/career advice.",
    },
    {
      role: "user" as const,
      content: [
        `Questionnaire: ${input.questionnaire.title}`,
        "Dimensions:",
        input.questionnaire.dimensions
          .map((dimension) => `- ${dimension.id}: ${dimension.name}. ${dimension.description}`)
          .join("\n"),
        `Question ID: ${input.question.id}`,
        `Question title: ${input.question.title}`,
        `Allowed score range per dimension: ${input.question.scoreRange.min} to ${input.question.scoreRange.max}`,
        "Scoring prompt:",
        input.question.scoringPrompt,
        "Answer:",
        input.answer,
      ].join("\n\n"),
    },
  ];
}

async function scoreOneOpenQuestion(input: {
  responseId: string;
  questionnaire: QuestionnaireSchema;
  question: OpenTextQuestion;
  answer: string;
  callAi: OpenAnswerAiCaller;
}): Promise<QuestionScoreResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await input.callAi({
        purpose: "open_answer_scoring",
        responseId: input.responseId,
        questionId: input.question.id,
        inputSummary: `Open answer scoring for response ${input.responseId}, question ${input.question.id}`,
        messages: buildOpenAnswerMessages(input),
        temperature: 0,
        maxTokens: 800,
        responseFormat: "json_object",
        thinking: "disabled",
      });
      const parsed = parseAiJsonWithSchema(
        result.content,
        createOpenAnswerScoringOutputSchema(input.questionnaire, input.question),
      );

      return {
        questionId: input.question.id,
        ok: true,
        score: parsed,
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    questionId: input.question.id,
    ok: false,
    error: summarizeError(lastError),
  };
}

function statusFromQuestionResults(results: QuestionScoreResult[]): Extract<
  AiScoringStatus,
  "completed" | "partially_failed" | "failed"
> {
  const failedCount = results.filter((result) => !result.ok).length;

  if (failedCount === 0) {
    return "completed";
  }

  if (failedCount === results.length) {
    return "failed";
  }

  return "partially_failed";
}

function mergeQuestionErrors(
  results: QuestionScoreResult[],
): Record<string, { status: "failed"; error: string }> | null {
  const failed = results.filter((result): result is Extract<QuestionScoreResult, { ok: false }> => !result.ok);

  if (failed.length === 0) {
    return null;
  }

  return Object.fromEntries(
    failed.map((result) => [
      result.questionId,
      {
        status: "failed" as const,
        error: result.error,
      },
    ]),
  );
}

function openAnswerScoresFromResults(results: QuestionScoreResult[]): OpenAnswerScores {
  return Object.fromEntries(
    results
      .filter((result): result is Extract<QuestionScoreResult, { ok: true }> => result.ok)
      .map((result) => [result.questionId, result.score]),
  );
}

function persistScoringResult(input: {
  db: AppDb;
  responseId: string;
  questionnaire: QuestionnaireSchema;
  answers: QuestionnaireAnswers;
  questionResults: QuestionScoreResult[];
  replaceDebugInterpretation?: boolean;
}) {
  const scoring = scoreQuestionnaire(
    input.questionnaire,
    input.answers,
    openAnswerScoresFromResults(input.questionResults),
  );
  const status = statusFromQuestionResults(input.questionResults);
  const errors = mergeQuestionErrors(input.questionResults);

  input.db
    .update(responses)
    .set({
      perQuestionScores: JSON.stringify(scoring.perQuestionScores),
      finalVector: JSON.stringify(scoring.finalVector),
      ...(input.replaceDebugInterpretation ? { debugInterpretation: null } : {}),
      aiScoringStatus: status,
      aiScoringError: errors ? JSON.stringify(errors) : null,
    })
    .where(eq(responses.id, input.responseId))
    .run();

  return {
    status,
    scoredQuestionCount: input.questionResults.filter((result) => result.ok).length,
    failedQuestionCount: input.questionResults.filter((result) => !result.ok).length,
  };
}

export function claimNextOpenAnswerResponse(db: AppDb): PendingResponseRow | null {
  const candidate = db
    .select({
      responseId: responses.id,
      versionId: responses.versionId,
      answers: responses.answers,
      schemaSnapshot: questionnaireVersions.schemaSnapshot,
    })
    .from(responses)
    .innerJoin(questionnaireVersions, eq(responses.versionId, questionnaireVersions.id))
    .where(inArray(responses.aiScoringStatus, claimableStatuses))
    .limit(1)
    .get();

  if (!candidate) {
    return null;
  }

  const claim = db
    .update(responses)
    .set({
      aiScoringStatus: "scoring_open_answers",
      aiScoringError: null,
    })
    .where(and(eq(responses.id, candidate.responseId), inArray(responses.aiScoringStatus, claimableStatuses)))
    .run();

  return claim.changes === 0 ? null : candidate;
}

export async function scoreClaimedOpenAnswerResponse(input: {
  db: AppDb;
  response: PendingResponseRow;
  callAi: OpenAnswerAiCaller;
  replaceDebugInterpretation?: boolean;
}): Promise<ScoreOpenAnswerResponseResult> {
  const { db, response } = input;

  try {
    const questionnaire = parseQuestionnaireSchema(JSON.parse(response.schemaSnapshot));
    const answers = parseAnswers(response.answers);
    const openQuestions = findOpenQuestions(questionnaire);

    if (openQuestions.length === 0) {
      const scoring = scoreQuestionnaire(questionnaire, answers);

      db.update(responses)
        .set({
          perQuestionScores: JSON.stringify(scoring.perQuestionScores),
          finalVector: JSON.stringify(scoring.finalVector),
          ...(input.replaceDebugInterpretation ? { debugInterpretation: null } : {}),
          aiScoringStatus: "completed",
          aiScoringError: null,
        })
        .where(eq(responses.id, response.responseId))
        .run();

      await generateDebugInterpretationForResponse({
        db,
        responseId: response.responseId,
        finalStatus: "completed",
        callAi: input.callAi,
      });

      return {
        ok: true,
        responseId: response.responseId,
        status: "completed",
        scoredQuestionCount: 0,
        failedQuestionCount: 0,
      };
    }

    const questionResults = await Promise.allSettled(
      openQuestions.map((question) => {
        const answer = answers[question.id];

        return scoreOneOpenQuestion({
          responseId: response.responseId,
          questionnaire,
          question,
          answer: typeof answer === "string" ? answer : "",
          callAi: input.callAi,
        });
      }),
    );
    const settledResults = questionResults.map((result, index): QuestionScoreResult => {
      if (result.status === "fulfilled") {
        return result.value;
      }

      return {
        questionId: openQuestions[index].id,
        ok: false,
        error: summarizeError(result.reason),
      };
    });
    const persisted = persistScoringResult({
      db,
      responseId: response.responseId,
      questionnaire,
      answers,
      questionResults: settledResults,
      replaceDebugInterpretation: input.replaceDebugInterpretation,
    });

    if (!(input.replaceDebugInterpretation && persisted.status === "failed")) {
      await generateDebugInterpretationForResponse({
        db,
        responseId: response.responseId,
        finalStatus: persisted.status,
        callAi: input.callAi,
      });
    }

    return {
      ok: true,
      responseId: response.responseId,
      ...persisted,
    };
  } catch (error) {
    const summarized = summarizeError(error);

    db.update(responses)
      .set({
        aiScoringStatus: "failed",
        aiScoringError: summarized,
      })
      .where(eq(responses.id, response.responseId))
      .run();

    return {
      ok: false,
      responseId: response.responseId,
      error: summarized,
    };
  }
}

export async function processNextOpenAnswerResponse(input: {
  db: AppDb;
  callAi: OpenAnswerAiCaller;
}): Promise<ScoreOpenAnswerResponseResult | null> {
  const response = claimNextOpenAnswerResponse(input.db);

  if (!response) {
    return null;
  }

  return scoreClaimedOpenAnswerResponse({
    db: input.db,
    response,
    callAi: input.callAi,
  });
}
