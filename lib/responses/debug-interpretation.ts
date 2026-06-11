import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { questionnaireVersions, responses, type AiScoringStatus } from "../db/schema.ts";
import type { AiChatCompletionInput, AiChatCompletionResult } from "../ai/core.ts";
import type { PerQuestionScore, QuestionnaireAnswers } from "../scoring/engine.ts";
import { parseQuestionnaireSchema, type QuestionnaireSchema } from "../schema/questionnaire.ts";

export type DebugInterpretationAiCaller = (input: AiChatCompletionInput) => Promise<AiChatCompletionResult>;

export type DebugInterpretationResult =
  | {
      ok: true;
      responseId: string;
      debugInterpretation: string;
    }
  | {
      ok: false;
      responseId: string;
      error: string;
    };

type DebugCandidateRow = {
  responseId: string;
  finalStatus: Extract<AiScoringStatus, "completed" | "partially_failed" | "failed">;
  answers: string;
  perQuestionScores: string | null;
  finalVector: string;
  aiScoringError: string | null;
  schemaSnapshot: string;
};

const finalStatuses = ["completed", "partially_failed", "failed"] as const satisfies AiScoringStatus[];
type FinalAiScoringStatus = (typeof finalStatuses)[number];
const claimableStatuses = [...finalStatuses, "generating_debug_interpretation"] as const satisfies AiScoringStatus[];
const claimMarkerKey = "debug_interpretation_claim";

function isFinalStatus(status: AiScoringStatus): status is FinalAiScoringStatus {
  return finalStatuses.some((candidate) => candidate === status);
}

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 1_000);
  }

  return String(error).slice(0, 1_000);
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stringifyError(value: Record<string, unknown>) {
  return Object.keys(value).length > 0 ? JSON.stringify(value) : null;
}

function formatVector(vector: Record<string, number>) {
  return Object.entries(vector)
    .map(([dimensionId, value]) => `- ${dimensionId}: ${value}`)
    .join("\n");
}

function selectedChoiceLabels(questionnaire: QuestionnaireSchema, answers: QuestionnaireAnswers) {
  const lines: string[] = [];

  for (const question of questionnaire.questions) {
    if (question.type !== "single_choice" && question.type !== "multiple_choice") {
      continue;
    }

    const rawAnswer = answers[question.id];
    const selectedIds = Array.isArray(rawAnswer) ? rawAnswer : typeof rawAnswer === "string" ? [rawAnswer] : [];
    const labels = selectedIds
      .map((optionId) => {
        const option = question.options.find((candidate) => candidate.id === optionId);

        return option ? `${option.label} (${option.id})` : optionId;
      })
      .filter(Boolean);

    if (labels.length > 0) {
      lines.push(`- ${question.title} (${question.id}): ${labels.join(", ")}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "- No choice answers.";
}

function openAnswerLines(questionnaire: QuestionnaireSchema, answers: QuestionnaireAnswers) {
  const lines: string[] = [];

  for (const question of questionnaire.questions) {
    if (question.type !== "open_text") {
      continue;
    }

    const answer = answers[question.id];
    lines.push(`- ${question.title} (${question.id}): ${typeof answer === "string" && answer ? answer : "[blank]"}`);
  }

  return lines.length > 0 ? lines.join("\n") : "- No open answers.";
}

function scoringRationaleLines(scores: PerQuestionScore[]) {
  const lines = scores
    .filter((score) => score.rationale || score.confidence !== undefined)
    .map((score) => {
      const confidence = score.confidence === undefined ? "n/a" : String(score.confidence);

      return `- ${score.questionTitle} (${score.questionId}): confidence=${confidence}; rationale=${
        score.rationale ?? "n/a"
      }`;
    });

  return lines.length > 0 ? lines.join("\n") : "- No AI scoring rationale.";
}

function rankedDimensions(questionnaire: QuestionnaireSchema, finalVector: Record<string, number>, direction: "top" | "bottom") {
  const sorted = questionnaire.dimensions
    .map((dimension) => ({
      ...dimension,
      value: finalVector[dimension.id] ?? 0,
    }))
    .sort((left, right) => (direction === "top" ? right.value - left.value : left.value - right.value))
    .slice(0, 3);

  return sorted.map((dimension) => `- ${dimension.name} (${dimension.id}): ${dimension.value}`).join("\n");
}

export function buildDebugInterpretationMessages(input: {
  questionnaire: QuestionnaireSchema;
  answers: QuestionnaireAnswers;
  perQuestionScores: PerQuestionScore[];
  finalVector: Record<string, number>;
}) {
  return [
    {
      role: "system" as const,
      content:
        "You write an internal debug interpretation for a questionnaire test result. Return plain text only. Include readable explanation, result highlights, and instability or improvement signals for the questionnaire design. Do not present a scientific diagnosis. Do not give deterministic school, major, career, medical, or life advice. Treat the result as exploratory internal testing evidence, not a validated assessment.",
    },
    {
      role: "user" as const,
      content: [
        `Questionnaire title: ${input.questionnaire.title}`,
        `Scenario: ${input.questionnaire.scenario}`,
        "Dimensions:",
        input.questionnaire.dimensions
          .map((dimension) => `- ${dimension.id}: ${dimension.name}. ${dimension.description}`)
          .join("\n"),
        "Final vector:",
        formatVector(input.finalVector),
        "Top dimensions:",
        rankedDimensions(input.questionnaire, input.finalVector, "top"),
        "Bottom dimensions:",
        rankedDimensions(input.questionnaire, input.finalVector, "bottom"),
        "Key choices:",
        selectedChoiceLabels(input.questionnaire, input.answers),
        "Open answers:",
        openAnswerLines(input.questionnaire, input.answers),
        "AI scoring rationale:",
        scoringRationaleLines(input.perQuestionScores),
        "Questionnaire resultDebugPrompt:",
        input.questionnaire.resultDebugPrompt || "[empty]",
      ].join("\n\n"),
    },
  ];
}

function mergeDebugError(existing: string | null, error: string) {
  const parsed = parseJson<Record<string, unknown>>(existing, {});
  delete parsed[claimMarkerKey];

  return JSON.stringify({
    ...parsed,
    debug_interpretation: {
      status: "failed",
      error,
    },
  });
}

function hasRecordedDebugFailure(rawError: string | null) {
  const parsed = parseJson<Record<string, unknown>>(rawError, {});
  const debugInterpretation = parsed.debug_interpretation;

  return Boolean(
    debugInterpretation &&
      typeof debugInterpretation === "object" &&
      "status" in debugInterpretation &&
      debugInterpretation.status === "failed",
  );
}

function withClaimMarker(existing: string | null, finalStatus: FinalAiScoringStatus) {
  const parsed = parseJson<Record<string, unknown>>(existing, {});

  return JSON.stringify({
    ...parsed,
    [claimMarkerKey]: {
      finalStatus,
    },
  });
}

function withoutClaimMarker(existing: string | null) {
  const parsed = parseJson<Record<string, unknown>>(existing, {});
  delete parsed[claimMarkerKey];

  return stringifyError(parsed);
}

function finalStatusFromClaimMarker(rawError: string | null): FinalAiScoringStatus | null {
  const parsed = parseJson<Record<string, unknown>>(rawError, {});
  const marker = parsed[claimMarkerKey];

  if (!marker || typeof marker !== "object" || !("finalStatus" in marker)) {
    return null;
  }

  const finalStatus = marker.finalStatus as AiScoringStatus;

  return typeof finalStatus === "string" && isFinalStatus(finalStatus) ? finalStatus : null;
}

function fallbackFinalStatusForStuckRow(rawError: string | null): FinalAiScoringStatus {
  const parsed = parseJson<Record<string, unknown>>(rawError, {});
  delete parsed[claimMarkerKey];

  return Object.keys(parsed).length > 0 ? "partially_failed" : "completed";
}

async function generateAndPersistDebugInterpretation(input: {
  db: AppDb;
  response: DebugCandidateRow;
  callAi: DebugInterpretationAiCaller;
}): Promise<DebugInterpretationResult> {
  const { db, response } = input;

  try {
    const questionnaire = parseQuestionnaireSchema(JSON.parse(response.schemaSnapshot));
    const answers = parseJson<QuestionnaireAnswers>(response.answers, {});
    const perQuestionScores = parseJson<PerQuestionScore[]>(response.perQuestionScores, []);
    const finalVector = parseJson<Record<string, number>>(response.finalVector, {});

    const aiResult = await input.callAi({
      purpose: "debug_interpretation",
      responseId: response.responseId,
      inputSummary: `Debug interpretation for response ${response.responseId}`,
      messages: buildDebugInterpretationMessages({
        questionnaire,
        answers,
        perQuestionScores,
        finalVector,
      }),
      temperature: 0.2,
      maxTokens: 1_200,
      thinking: "enabled",
    });
    const debugInterpretation = aiResult.content.trim();

    db.update(responses)
      .set({
        debugInterpretation,
        aiScoringStatus: response.finalStatus,
        aiScoringError: withoutClaimMarker(response.aiScoringError),
      })
      .where(eq(responses.id, response.responseId))
      .run();

    return {
      ok: true,
      responseId: response.responseId,
      debugInterpretation,
    };
  } catch (error) {
    const summarized = summarizeError(error);

    db.update(responses)
      .set({
        aiScoringStatus: response.finalStatus,
        aiScoringError: mergeDebugError(response.aiScoringError, summarized),
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

export async function generateDebugInterpretationForResponse(input: {
  db: AppDb;
  responseId: string;
  finalStatus: Extract<AiScoringStatus, "completed" | "partially_failed" | "failed">;
  callAi: DebugInterpretationAiCaller;
}): Promise<DebugInterpretationResult | null> {
  const row = input.db
    .select({
      responseId: responses.id,
      finalStatus: responses.aiScoringStatus,
      answers: responses.answers,
      perQuestionScores: responses.perQuestionScores,
      finalVector: responses.finalVector,
      aiScoringError: responses.aiScoringError,
      schemaSnapshot: questionnaireVersions.schemaSnapshot,
    })
    .from(responses)
    .innerJoin(questionnaireVersions, eq(responses.versionId, questionnaireVersions.id))
    .where(and(eq(responses.id, input.responseId), isNotNull(responses.finalVector), isNull(responses.debugInterpretation)))
    .get();

  if (!row || hasRecordedDebugFailure(row.aiScoringError)) {
    return null;
  }

  const claim = input.db
    .update(responses)
    .set({
      aiScoringStatus: "generating_debug_interpretation",
      aiScoringError: withClaimMarker(row.aiScoringError, input.finalStatus),
    })
    .where(and(eq(responses.id, input.responseId), isNull(responses.debugInterpretation)))
    .run();

  if (claim.changes === 0) {
    return null;
  }

  return generateAndPersistDebugInterpretation({
    db: input.db,
    response: {
      ...row,
      finalStatus: input.finalStatus,
      finalVector: row.finalVector ?? "{}",
    },
    callAi: input.callAi,
  });
}

export async function processNextDebugInterpretationResponse(input: {
  db: AppDb;
  callAi: DebugInterpretationAiCaller;
}): Promise<DebugInterpretationResult | null> {
  const candidates = input.db
    .select({
      responseId: responses.id,
      finalStatus: responses.aiScoringStatus,
      answers: responses.answers,
      perQuestionScores: responses.perQuestionScores,
      finalVector: responses.finalVector,
      aiScoringError: responses.aiScoringError,
      schemaSnapshot: questionnaireVersions.schemaSnapshot,
    })
    .from(responses)
    .innerJoin(questionnaireVersions, eq(responses.versionId, questionnaireVersions.id))
    .where(
      and(
        inArray(responses.aiScoringStatus, claimableStatuses),
        isNotNull(responses.finalVector),
        isNull(responses.debugInterpretation),
      ),
    )
    .limit(20)
    .all();

  const candidate = candidates.find((row) => !hasRecordedDebugFailure(row.aiScoringError));

  if (!candidate) {
    return null;
  }
  const finalStatus = isFinalStatus(candidate.finalStatus)
    ? candidate.finalStatus
    : finalStatusFromClaimMarker(candidate.aiScoringError) ?? fallbackFinalStatusForStuckRow(candidate.aiScoringError);

  const claim = input.db
    .update(responses)
    .set({
      aiScoringStatus: "generating_debug_interpretation",
      aiScoringError: withClaimMarker(candidate.aiScoringError, finalStatus),
    })
    .where(
      and(
        eq(responses.id, candidate.responseId),
        inArray(responses.aiScoringStatus, claimableStatuses),
        isNull(responses.debugInterpretation),
      ),
    )
    .run();

  if (claim.changes === 0) {
    return null;
  }

  return generateAndPersistDebugInterpretation({
    db: input.db,
    response: {
      ...candidate,
      finalStatus,
      finalVector: candidate.finalVector ?? "{}",
    },
    callAi: input.callAi,
  });
}
