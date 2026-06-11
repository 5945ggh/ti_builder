import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppDb } from "../db/client.ts";
import { feedback, responses } from "../db/schema.ts";

const appIdSchema = z.string().trim().length(21);
const scoreSchema = z.coerce.number().int().min(1).max(5);

export const submitFeedbackInputSchema = z.object({
  resultToken: z.string().trim().min(1, "Result token is required."),
  interestScore: scoreSchema,
  accuracyScore: scoreSchema,
  shareWillingnessScore: scoreSchema,
  usefulnessScore: scoreSchema,
  comment: z.string().trim().max(4000).default(""),
});

export type SubmitFeedbackInput = {
  resultToken?: unknown;
  interestScore?: unknown;
  accuracyScore?: unknown;
  shareWillingnessScore?: unknown;
  usefulnessScore?: unknown;
  comment?: unknown;
};

export type SubmitFeedbackResult =
  | {
      ok: true;
      feedback: {
        id: string;
        responseId: string;
        updated: boolean;
      };
    }
  | {
      ok: false;
      error: string;
    };

type SubmitFeedbackOptions = {
  now?: Date;
  id?: string;
};

function stringifyIssues(error: z.ZodError) {
  return error.issues.map((issue) => issue.message).join("\n");
}

export function submitFeedback(
  db: AppDb,
  input: SubmitFeedbackInput,
  options: SubmitFeedbackOptions = {},
): SubmitFeedbackResult {
  const parsed = submitFeedbackInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: stringifyIssues(parsed.error),
    };
  }

  const response = db
    .select({
      id: responses.id,
    })
    .from(responses)
    .where(eq(responses.resultToken, parsed.data.resultToken))
    .get();

  if (!response) {
    return {
      ok: false,
      error: "Result not found.",
    };
  }

  const existing = db
    .select({
      id: feedback.id,
    })
    .from(feedback)
    .where(eq(feedback.responseId, response.id))
    .get();

  const parsedId = appIdSchema.safeParse(existing?.id ?? options.id ?? nanoid(21));

  if (!parsedId.success) {
    return {
      ok: false,
      error: "Generated feedback ID must be 21 characters.",
    };
  }

  db.insert(feedback)
    .values({
      id: parsedId.data,
      responseId: response.id,
      interestScore: parsed.data.interestScore,
      accuracyScore: parsed.data.accuracyScore,
      shareWillingnessScore: parsed.data.shareWillingnessScore,
      usefulnessScore: parsed.data.usefulnessScore,
      comment: parsed.data.comment,
      questionComments: null,
      createdAt: options.now ?? new Date(),
    })
    .onConflictDoUpdate({
      target: feedback.responseId,
      set: {
        interestScore: parsed.data.interestScore,
        accuracyScore: parsed.data.accuracyScore,
        shareWillingnessScore: parsed.data.shareWillingnessScore,
        usefulnessScore: parsed.data.usefulnessScore,
        comment: parsed.data.comment,
        questionComments: null,
      },
    })
    .run();

  return {
    ok: true,
    feedback: {
      id: parsedId.data,
      responseId: response.id,
      updated: Boolean(existing),
    },
  };
}
