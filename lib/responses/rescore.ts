import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AiChatCompletionInput, AiChatCompletionResult } from "../ai/core.ts";
import type { AppDb } from "../db/client.ts";
import { questionnaireVersions, responses } from "../db/schema.ts";
import { scoreClaimedOpenAnswerResponse } from "./open-answer-scoring.ts";

export type RescoreResponseAiCaller = (input: AiChatCompletionInput) => Promise<AiChatCompletionResult>;

export type RescoreResponseResult =
  | {
      ok: true;
      responseId: string;
      status: "completed" | "partially_failed" | "failed";
      scoredQuestionCount: number;
      failedQuestionCount: number;
    }
  | {
      ok: false;
      responseId: string;
      error: string;
    };

const rescoreResponseInputSchema = z.object({
  responseId: z.string().trim().min(1, "Response ID is required."),
});

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 1_000);
  }

  return String(error).slice(0, 1_000);
}

export async function rescoreResponse(input: {
  db: AppDb;
  responseId: string;
  callAi: RescoreResponseAiCaller;
}): Promise<RescoreResponseResult> {
  const parsed = rescoreResponseInputSchema.safeParse({
    responseId: input.responseId,
  });

  if (!parsed.success) {
    return {
      ok: false,
      responseId: input.responseId,
      error: parsed.error.issues.map((issue) => issue.message).join("\n"),
    };
  }

  const row = input.db
    .select({
      responseId: responses.id,
      versionId: responses.versionId,
      answers: responses.answers,
      perQuestionScores: responses.perQuestionScores,
      finalVector: responses.finalVector,
      debugInterpretation: responses.debugInterpretation,
      schemaSnapshot: questionnaireVersions.schemaSnapshot,
    })
    .from(responses)
    .innerJoin(questionnaireVersions, eq(responses.versionId, questionnaireVersions.id))
    .where(eq(responses.id, parsed.data.responseId))
    .get();

  if (!row) {
    return {
      ok: false,
      responseId: parsed.data.responseId,
      error: "Response not found.",
    };
  }

  try {
    const result = await scoreClaimedOpenAnswerResponse({
      db: input.db,
      response: row,
      callAi: input.callAi,
      replaceDebugInterpretation: true,
    });

    if (result.ok && result.status === "failed") {
      const failedRow = input.db
        .select({
          aiScoringError: responses.aiScoringError,
        })
        .from(responses)
        .where(eq(responses.id, parsed.data.responseId))
        .get();

      input.db
        .update(responses)
        .set({
          perQuestionScores: row.perQuestionScores,
          finalVector: row.finalVector,
          debugInterpretation: row.debugInterpretation,
          aiScoringStatus: "failed",
          aiScoringError: failedRow?.aiScoringError ?? "Rescore failed.",
        })
        .where(eq(responses.id, parsed.data.responseId))
        .run();
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      responseId: parsed.data.responseId,
      error: summarizeError(error),
    };
  }
}
