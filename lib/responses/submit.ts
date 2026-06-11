import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppDb } from "../db/client.ts";
import { questionnaireVersions, responses } from "../db/schema.ts";
import type { AiScoringStatus, ResponseSource } from "../db/schema.ts";
import { scoreQuestionnaire } from "../scoring/engine.ts";
import { parseQuestionnaireSchema, type QuestionnaireSchema } from "../schema/questionnaire.ts";

const appIdSchema = z.string().trim().length(21);

const answerValueSchema = z.union([z.string(), z.array(z.string())]);

export const submitResponseInputSchema = z.object({
  versionId: z.string().trim().min(1, "Version ID is required."),
  source: z.enum(["internal_member", "external_tester"]),
  memberId: z.string().trim().min(1).nullable(),
  submitterKey: z.string().trim().min(1, "Submitter key is required."),
  respondentName: z.string().trim().min(1, "Respondent name is required.").max(160),
  respondentNote: z.string().trim().max(2000),
  clientSubmissionId: z.string().trim().min(1, "Client submission ID is required.").max(120),
  answers: z.record(z.string().trim().min(1), answerValueSchema),
});

export type SubmitResponseInput = z.infer<typeof submitResponseInputSchema>;

export type SubmitResponseResult =
  | {
      ok: true;
      response: {
        id: string;
        resultToken: string;
        aiScoringStatus: AiScoringStatus;
        created: boolean;
      };
    }
  | {
      ok: false;
      error: string;
    };

type SubmitResponseOptions = {
  now?: Date;
  id?: string;
  resultToken?: string;
};

function isSqliteIdempotencyConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_UNIQUE" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes(
      "responses.version_id, responses.source, responses.submitter_key, responses.client_submission_id",
    )
  );
}

function stringifyIssues(error: z.ZodError) {
  return error.issues.map((issue) => issue.message).join("\n");
}

function validateAnswers(questionnaire: QuestionnaireSchema, answers: SubmitResponseInput["answers"]) {
  const errors: string[] = [];
  const questionIds = new Set(questionnaire.questions.map((question) => question.id));

  for (const answerQuestionId of Object.keys(answers)) {
    if (!questionIds.has(answerQuestionId)) {
      errors.push(`Unknown answer question id: ${answerQuestionId}.`);
    }
  }

  for (const question of questionnaire.questions) {
    const value = answers[question.id];

    if (value === undefined) {
      errors.push(`Missing answer for ${question.id}.`);
      continue;
    }

    if (question.type === "single_choice") {
      if (typeof value !== "string") {
        errors.push(`Answer for ${question.id} must be a single option ID.`);
        continue;
      }

      if (!question.options.some((option) => option.id === value)) {
        errors.push(`Unknown option for ${question.id}: ${value}.`);
      }
      continue;
    }

    if (question.type === "multiple_choice") {
      if (!Array.isArray(value)) {
        errors.push(`Answer for ${question.id} must be an array of option IDs.`);
        continue;
      }

      const optionIds = new Set(question.options.map((option) => option.id));
      const unknownOptions = value.filter((optionId) => !optionIds.has(optionId));

      if (value.length !== new Set(value).size) {
        errors.push(`Duplicate option IDs for ${question.id} are not allowed.`);
      }

      if (unknownOptions.length > 0) {
        errors.push(`Unknown option for ${question.id}: ${unknownOptions.join(", ")}.`);
      }
      continue;
    }

    if (typeof value !== "string") {
      errors.push(`Answer for ${question.id} must be open text.`);
    }
  }

  return errors;
}

function initialScoringStatus(questionnaire: QuestionnaireSchema): AiScoringStatus {
  return questionnaire.questions.some((question) => question.type === "open_text") ? "pending" : "completed";
}

function hasOpenTextQuestions(questionnaire: QuestionnaireSchema) {
  return questionnaire.questions.some((question) => question.type === "open_text");
}

function findExistingResponse(
  db: AppDb,
  input: Pick<SubmitResponseInput, "versionId" | "source" | "submitterKey" | "clientSubmissionId">,
) {
  return db
    .select({
      id: responses.id,
      resultToken: responses.resultToken,
      aiScoringStatus: responses.aiScoringStatus,
    })
    .from(responses)
    .where(
      and(
        eq(responses.versionId, input.versionId),
        eq(responses.source, input.source),
        eq(responses.submitterKey, input.submitterKey),
        eq(responses.clientSubmissionId, input.clientSubmissionId),
      ),
    )
    .get();
}

export function submitResponse(
  db: AppDb,
  input: SubmitResponseInput,
  options: SubmitResponseOptions = {},
): SubmitResponseResult {
  const parsed = submitResponseInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: stringifyIssues(parsed.error),
    };
  }

  if (parsed.data.source === "internal_member" && parsed.data.memberId !== parsed.data.submitterKey) {
    return {
      ok: false,
      error: "Internal submissions must use the selected member as submitter key.",
    };
  }

  const version = db
    .select({
      id: questionnaireVersions.id,
      questionnaireId: questionnaireVersions.questionnaireId,
      schemaSnapshot: questionnaireVersions.schemaSnapshot,
    })
    .from(questionnaireVersions)
    .where(eq(questionnaireVersions.id, parsed.data.versionId))
    .get();

  if (!version) {
    return {
      ok: false,
      error: "Published version not found.",
    };
  }

  let questionnaire: QuestionnaireSchema;

  try {
    questionnaire = parseQuestionnaireSchema(JSON.parse(version.schemaSnapshot));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Invalid published schema snapshot: ${error.message}` : "Invalid schema snapshot.",
    };
  }

  const answerErrors = validateAnswers(questionnaire, parsed.data.answers);

  if (answerErrors.length > 0) {
    return {
      ok: false,
      error: answerErrors.join("\n"),
    };
  }

  const parsedId = appIdSchema.safeParse(options.id ?? nanoid(21));
  const parsedResultToken = appIdSchema.safeParse(options.resultToken ?? nanoid(21));

  if (!parsedId.success || !parsedResultToken.success) {
    return {
      ok: false,
      error: "Generated response ID and result token must be 21 characters.",
    };
  }

  const status = initialScoringStatus(questionnaire);
  const synchronousScore = hasOpenTextQuestions(questionnaire)
    ? null
    : scoreQuestionnaire(questionnaire, parsed.data.answers);

  try {
    db.insert(responses)
      .values({
        id: parsedId.data,
        questionnaireId: version.questionnaireId,
        versionId: version.id,
        resultToken: parsedResultToken.data,
        respondentName: parsed.data.respondentName,
        respondentNote: parsed.data.respondentNote,
        memberId: parsed.data.memberId,
        source: parsed.data.source as ResponseSource,
        submitterKey: parsed.data.submitterKey,
        clientSubmissionId: parsed.data.clientSubmissionId,
        answers: JSON.stringify(parsed.data.answers),
        perQuestionScores: synchronousScore ? JSON.stringify(synchronousScore.perQuestionScores) : null,
        finalVector: synchronousScore ? JSON.stringify(synchronousScore.finalVector) : null,
        aiScoringStatus: status,
        createdAt: options.now ?? new Date(),
      })
      .run();

    return {
      ok: true,
      response: {
        id: parsedId.data,
        resultToken: parsedResultToken.data,
        aiScoringStatus: status,
        created: true,
      },
    };
  } catch (error) {
    if (!isSqliteIdempotencyConflict(error)) {
      throw error;
    }

    const existing = findExistingResponse(db, parsed.data);

    if (!existing) {
      return {
        ok: false,
        error: "Duplicate submission detected but existing response could not be loaded.",
      };
    }

    return {
      ok: true,
      response: {
        id: existing.id,
        resultToken: existing.resultToken,
        aiScoringStatus: existing.aiScoringStatus,
        created: false,
      },
    };
  }
}
