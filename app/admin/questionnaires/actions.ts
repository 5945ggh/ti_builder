"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { callAiChatCompletion } from "@/lib/ai/client";
import { generateQuestionnaireSchemaDraft, schemaDraftGenerationModeSchema } from "@/lib/ai/schema-draft";
import { requireSelectedAdminMember } from "@/lib/auth/admin";
import { createDb } from "@/lib/db/client";
import { questionnaires } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { confirmQuestionnaireDraftUpdate } from "@/lib/questionnaires/draft-server";
import { publishQuestionnaireVersion } from "@/lib/questionnaires/publish";
import {
  createInitialQuestionnaireDraft,
  formatQuestionnaireDraft,
  validateQuestionnaireDraftText,
} from "@/lib/questionnaires/draft";

export type QuestionnaireFormState = {
  error?: string;
};

export type PublishQuestionnaireFormState = {
  error?: string;
};

export type GenerateSchemaDraftFormState =
  | {
      status?: "idle";
      error?: string;
    }
  | {
      status: "valid";
      draftText: string;
      rawOutput: string;
      model: string;
      latencyMs: number;
      attempts: number;
    }
  | {
      status: "invalid";
      error: string;
      rawOutput: string | null;
      model: string | null;
      latencyMs: number | null;
      attempts: number | null;
    };

export type ConfirmGeneratedDraftFormState = {
  error?: string;
  saved?: boolean;
  draftText?: string;
};

const metadataSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(160, "Title must be 160 characters or less."),
  description: z.string().trim().max(2000, "Description must be 2000 characters or less."),
  scenario: z.string().trim().max(240, "Scenario must be 240 characters or less."),
  internalNote: z.string().trim().max(4000, "Internal note must be 4000 characters or less."),
});

const updateQuestionnaireSchema = metadataSchema.extend({
  questionnaireId: z.string().trim().min(1, "Questionnaire ID is required."),
  schemaText: z.string().trim().min(1, "Draft schema JSON is required."),
});

const publishQuestionnaireFormSchema = z.object({
  questionnaireId: z.string().trim().min(1, "Questionnaire ID is required."),
  publishNote: z.string().trim().min(1, "Publish note is required.").max(2000, "Publish note is too long."),
});

function generateSchemaDraftFormSchema(sourceMaxChars: number) {
  return z.object({
    questionnaireId: z.string().trim().min(1, "Questionnaire ID is required."),
    mode: schemaDraftGenerationModeSchema,
    sourceText: z
      .string()
      .trim()
      .min(20, "Source text must be at least 20 characters.")
      .max(sourceMaxChars, `Source text must be ${sourceMaxChars.toLocaleString("en-US")} characters or less.`),
    existingDraftSchema: z.string().max(60_000, "Existing draft context is too long.").optional(),
  });
}

const confirmGeneratedDraftFormSchema = z.object({
  questionnaireId: z.string().trim().min(1, "Questionnaire ID is required."),
  generatedDraftText: z.string().trim().min(1, "Generated draft JSON is required."),
});

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function parseMetadata(formData: FormData) {
  return metadataSchema.safeParse({
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    scenario: formValue(formData, "scenario"),
    internalNote: formValue(formData, "internalNote"),
  });
}

export async function createQuestionnaireAction(_state: QuestionnaireFormState, formData: FormData) {
  const member = await requireSelectedAdminMember();
  const parsed = parseMetadata(formData);

  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((issue) => issue.message).join("\n"),
    };
  }

  const now = new Date();
  const id = nanoid(21);
  const draft = createInitialQuestionnaireDraft(parsed.data);
  const draftValidation = validateQuestionnaireDraftText(formatQuestionnaireDraft(draft));

  if (!draftValidation.ok) {
    return {
      error: `Generated starter draft is invalid: ${draftValidation.error}`,
    };
  }

  createDb()
    .insert(questionnaires)
    .values({
      id,
      title: parsed.data.title,
      description: parsed.data.description,
      scenario: parsed.data.scenario,
      internalNote: parsed.data.internalNote,
      createdByMemberId: member.id,
      createdAt: now,
      updatedAt: now,
      currentDraftSchema: draftValidation.formattedJson,
    })
    .run();

  revalidatePath("/admin");
  revalidatePath("/admin/questionnaires");
  redirect(`/admin/questionnaires/${id}`);
}

export async function updateQuestionnaireAction(_state: QuestionnaireFormState, formData: FormData) {
  await requireSelectedAdminMember();
  const parsed = updateQuestionnaireSchema.safeParse({
    questionnaireId: formValue(formData, "questionnaireId"),
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    scenario: formValue(formData, "scenario"),
    internalNote: formValue(formData, "internalNote"),
    schemaText: formValue(formData, "schemaText"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((issue) => issue.message).join("\n"),
    };
  }

  const draftValidation = validateQuestionnaireDraftText(parsed.data.schemaText);

  if (!draftValidation.ok) {
    return {
      error: draftValidation.error,
    };
  }

  const synchronizedDraft = {
    ...draftValidation.questionnaire,
    title: parsed.data.title,
    description: parsed.data.description,
    scenario: parsed.data.scenario,
  };

  const result = createDb()
    .update(questionnaires)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      scenario: parsed.data.scenario,
      internalNote: parsed.data.internalNote,
      updatedAt: new Date(),
      currentDraftSchema: formatQuestionnaireDraft(synchronizedDraft),
    })
    .where(eq(questionnaires.id, parsed.data.questionnaireId))
    .run();

  if (result.changes === 0) {
    return {
      error: "Questionnaire not found.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/questionnaires");
  revalidatePath(`/admin/questionnaires/${parsed.data.questionnaireId}`);

  return {};
}

export async function publishQuestionnaireAction(_state: PublishQuestionnaireFormState, formData: FormData) {
  const member = await requireSelectedAdminMember();
  const parsed = publishQuestionnaireFormSchema.safeParse({
    questionnaireId: formValue(formData, "questionnaireId"),
    publishNote: formValue(formData, "publishNote"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((issue) => issue.message).join("\n"),
    };
  }

  const result = publishQuestionnaireVersion(createDb(), {
    questionnaireId: parsed.data.questionnaireId,
    publishNote: parsed.data.publishNote,
    publishedByMemberId: member.id,
  });

  if (!result.ok) {
    return {
      error: result.error,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/questionnaires");
  revalidatePath(`/admin/questionnaires/${parsed.data.questionnaireId}`);

  return {};
}

export async function generateSchemaDraftAction(
  _state: GenerateSchemaDraftFormState,
  formData: FormData,
): Promise<GenerateSchemaDraftFormState> {
  await requireSelectedAdminMember();
  const parsed = generateSchemaDraftFormSchema(getServerEnv().AI_SCHEMA_SOURCE_MAX_CHARS).safeParse({
    questionnaireId: formValue(formData, "questionnaireId"),
    mode: formValue(formData, "mode"),
    sourceText: formValue(formData, "sourceText"),
    existingDraftSchema: formValue(formData, "existingDraftSchema"),
  });

  if (!parsed.success) {
    return {
      status: "idle",
      error: parsed.error.issues.map((issue) => issue.message).join("\n"),
    };
  }

  const existing = createDb()
    .select({
      id: questionnaires.id,
    })
    .from(questionnaires)
    .where(eq(questionnaires.id, parsed.data.questionnaireId))
    .get();

  if (!existing) {
    return {
      status: "idle",
      error: "Questionnaire not found.",
    };
  }

  const result = await generateQuestionnaireSchemaDraft({
    mode: parsed.data.mode,
    sourceText: parsed.data.sourceText,
    existingDraftSchema: parsed.data.existingDraftSchema,
  }, callAiChatCompletion);

  if (!result.ok) {
    return {
      status: "invalid",
      error: result.error,
      rawOutput: result.rawOutput,
      model: result.model,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
    };
  }

  return {
    status: "valid",
    draftText: result.draftText,
    rawOutput: result.rawOutput,
    model: result.model,
    latencyMs: result.latencyMs,
    attempts: result.attempts,
  };
}

export async function confirmGeneratedDraftAction(
  _state: ConfirmGeneratedDraftFormState,
  formData: FormData,
): Promise<ConfirmGeneratedDraftFormState> {
  await requireSelectedAdminMember();
  const parsed = confirmGeneratedDraftFormSchema.safeParse({
    questionnaireId: formValue(formData, "questionnaireId"),
    generatedDraftText: formValue(formData, "generatedDraftText"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((issue) => issue.message).join("\n"),
    };
  }

  const result = confirmQuestionnaireDraftUpdate(createDb(), {
    questionnaireId: parsed.data.questionnaireId,
    schemaText: parsed.data.generatedDraftText,
  });

  if (!result.ok) {
    return {
      error: result.error,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/questionnaires");
  revalidatePath(`/admin/questionnaires/${parsed.data.questionnaireId}`);

  return {
    saved: true,
    draftText: result.draftText,
  };
}
