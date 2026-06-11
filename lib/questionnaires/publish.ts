import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppDb } from "../db/client.ts";
import { questionnaireVersions, questionnaires } from "../db/schema.ts";
import { validateQuestionnaireDraftText } from "./draft.ts";

export const publishQuestionnaireInputSchema = z.object({
  questionnaireId: z.string().trim().min(1, "Questionnaire ID is required."),
  publishNote: z.string().trim().min(1, "Publish note is required.").max(2000, "Publish note is too long."),
  publishedByMemberId: z.string().trim().min(1, "Published-by member ID is required."),
});

export type PublishQuestionnaireInput = z.infer<typeof publishQuestionnaireInputSchema>;

const appIdSchema = z.string().trim().length(21);

export const immutableQuestionnaireVersionFields = [
  "schemaSnapshot",
  "versionNumber",
  "questionnaireId",
  "publishedByMemberId",
  "createdAt",
] as const;

const mutableVersionFieldsSchema = z
  .object({
    publishNote: z.string().trim().max(2000).optional(),
    testToken: z.string().trim().length(21).optional(),
    testTokenMaxResponses: z.number().int().min(1).max(10000).optional(),
    testTokenResponseCount: z.number().int().min(0).optional(),
    testTokenDisabledAt: z.date().nullable().optional(),
    externalResultDetailLevel: z.enum(["summary", "detailed"]).optional(),
  })
  .strict();

const maxPublishAttempts = 3;

type PublishQuestionnaireVersionOptions = {
  now?: Date;
  id?: string;
  testToken?: string;
  beforeInsert?: (context: {
    attempt: number;
    questionnaireId: string;
    versionNumber: number;
    id: string;
    testToken: string;
  }) => void;
};

function isSqliteUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.code === "SQLITE_CONSTRAINT_PRIMARYKEY")
  );
}

export function assertQuestionnaireVersionImmutableFieldsAbsent(update: Record<string, unknown>) {
  const attemptedImmutableFields = immutableQuestionnaireVersionFields.filter((field) => field in update);

  if (attemptedImmutableFields.length > 0) {
    throw new Error(`Cannot update immutable questionnaire version fields: ${attemptedImmutableFields.join(", ")}`);
  }
}

export function publishQuestionnaireVersion(
  db: AppDb,
  input: PublishQuestionnaireInput,
  options: PublishQuestionnaireVersionOptions = {},
) {
  const parsed = publishQuestionnaireInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues.map((issue) => issue.message).join("\n"),
    };
  }

  const questionnaire = db
    .select({
      id: questionnaires.id,
      currentDraftSchema: questionnaires.currentDraftSchema,
    })
    .from(questionnaires)
    .where(eq(questionnaires.id, parsed.data.questionnaireId))
    .get();

  if (!questionnaire) {
    return {
      ok: false as const,
      error: "Questionnaire not found.",
    };
  }

  const draftValidation = validateQuestionnaireDraftText(questionnaire.currentDraftSchema);

  if (!draftValidation.ok) {
    return {
      ok: false as const,
      error: draftValidation.error,
    };
  }

  for (let attempt = 1; attempt <= maxPublishAttempts; attempt += 1) {
    const latestVersion = db
      .select({
        versionNumber: sql<number>`coalesce(max(${questionnaireVersions.versionNumber}), 0)`,
      })
      .from(questionnaireVersions)
      .where(eq(questionnaireVersions.questionnaireId, questionnaire.id))
      .get();
    const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
    const now = options.now ?? new Date();
    const parsedId = appIdSchema.safeParse(options.id ?? nanoid(21));
    const parsedTestToken = appIdSchema.safeParse(options.testToken ?? nanoid(21));

    if (!parsedId.success || !parsedTestToken.success) {
      return {
        ok: false as const,
        error: "Generated version ID and test token must be 21 characters.",
      };
    }

    try {
      options.beforeInsert?.({
        attempt,
        questionnaireId: questionnaire.id,
        versionNumber,
        id: parsedId.data,
        testToken: parsedTestToken.data,
      });

      db.insert(questionnaireVersions)
        .values({
          id: parsedId.data,
          questionnaireId: questionnaire.id,
          versionNumber,
          schemaSnapshot: draftValidation.formattedJson,
          publishedByMemberId: parsed.data.publishedByMemberId,
          publishNote: parsed.data.publishNote,
          testToken: parsedTestToken.data,
          testTokenMaxResponses: 50,
          testTokenResponseCount: 0,
          externalResultDetailLevel: "summary",
          createdAt: now,
        })
        .run();

      return {
        ok: true as const,
        version: {
          id: parsedId.data,
          questionnaireId: questionnaire.id,
          versionNumber,
          schemaSnapshot: draftValidation.formattedJson,
          publishedByMemberId: parsed.data.publishedByMemberId,
          publishNote: parsed.data.publishNote,
          testToken: parsedTestToken.data,
          createdAt: now,
        },
      };
    } catch (error) {
      if (isSqliteUniqueConstraintError(error) && attempt < maxPublishAttempts) {
        continue;
      }

      if (isSqliteUniqueConstraintError(error)) {
        return {
          ok: false as const,
          error: "Could not publish a unique questionnaire version. Please retry.",
        };
      }

      throw error;
    }
  }

  return {
    ok: false as const,
    error: "Could not publish a unique questionnaire version. Please retry.",
  };
}

export function updateQuestionnaireVersionMutableFields(
  db: AppDb,
  versionId: string,
  update: Record<string, unknown>,
) {
  const parsedVersionId = z.string().trim().min(1).safeParse(versionId);

  if (!parsedVersionId.success) {
    return {
      ok: false as const,
      error: "Version ID is required.",
    };
  }

  try {
    assertQuestionnaireVersionImmutableFieldsAbsent(update);
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Cannot update immutable questionnaire version fields.",
    };
  }

  const parsedUpdate = mutableVersionFieldsSchema.safeParse(update);

  if (!parsedUpdate.success) {
    return {
      ok: false as const,
      error: parsedUpdate.error.issues.map((issue) => issue.message).join("\n"),
    };
  }

  const updateValues = parsedUpdate.data;

  if (Object.keys(updateValues).length === 0) {
    return {
      ok: true as const,
      changes: 0,
    };
  }

  const result = db
    .update(questionnaireVersions)
    .set(updateValues)
    .where(eq(questionnaireVersions.id, parsedVersionId.data))
    .run();

  return {
    ok: true as const,
    changes: result.changes,
  };
}
