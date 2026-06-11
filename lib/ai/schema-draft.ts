import { z } from "zod";
import type { AiChatCompletionResult } from "./core.ts";
import { parseAiJsonWithSchema } from "./core.ts";
import { formatQuestionnaireDraft, validateQuestionnaireDraftText } from "../questionnaires/draft.ts";
import { questionnaireSchema, type QuestionnaireSchema } from "../schema/questionnaire.ts";

export const schemaDraftGenerationModeSchema = z.enum([
  "document_to_schema",
  "rewrite_questions",
  "dimension_definitions",
  "scoring_vectors",
  "open_scoring_prompts",
]);

export type SchemaDraftGenerationMode = z.infer<typeof schemaDraftGenerationModeSchema>;

export type GenerateQuestionnaireSchemaDraftInput = {
  sourceText: string;
  mode: SchemaDraftGenerationMode;
  title?: string;
  description?: string;
  scenario?: string;
  existingDraftSchema?: string;
};

export type GenerateQuestionnaireSchemaDraftResult =
  | {
      ok: true;
      questionnaire: QuestionnaireSchema;
      draftText: string;
      formattedJson: string;
      rawOutput: string;
      model: string;
      latencyMs: number;
      attempts: number;
    }
  | {
      ok: false;
      error: string;
      rawOutput: string;
      model: string | null;
      latencyMs: number | null;
      attempts: number | null;
    };

type AiCaller = (input: {
  purpose: "schema_draft_generation";
  inputSummary: string;
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
  temperature: number;
  maxTokens: number;
  responseFormat: "json_object";
  thinking: "disabled";
}) => Promise<AiChatCompletionResult>;

const modeInstructions: Record<SchemaDraftGenerationMode, string> = {
  document_to_schema:
    "Turn the source document into a complete questionnaire schema with dimensions, choice questions, open questions when useful, scoring vectors, and result debug prompt.",
  rewrite_questions:
    "Rewrite and improve the question wording while preserving the intent of the source. Keep IDs stable and compact when possible.",
  dimension_definitions:
    "Focus on strong dimension definitions and labels. Generate or refine questions only as needed to make the dimensions testable.",
  scoring_vectors:
    "Focus on choice options and deltaVector scoring. Ensure every deltaVector key references a declared dimension.",
  open_scoring_prompts:
    "Focus on open_text questions and scoringPrompt quality. Include score ranges and prompts that ask for deltaVector, confidence, and rationale.",
};

function normalizeOptionalText(value?: string) {
  return value?.trim() ?? "";
}

function summarizeSourceText(sourceText: string) {
  return sourceText.replace(/\s+/g, " ").trim().slice(0, 300);
}

export function buildQuestionnaireSchemaDraftMessages(input: GenerateQuestionnaireSchemaDraftInput) {
  const title = normalizeOptionalText(input.title);
  const description = normalizeOptionalText(input.description);
  const scenario = normalizeOptionalText(input.scenario);

  return [
    {
      role: "system" as const,
      content:
        "You generate questionnaire schema JSON for TI Builder. Return only valid JSON and no markdown. The JSON must match this TypeScript shape exactly: { title: string, description: string, scenario: string, dimensions: Array<{ id: string, name: string, description: string, lowLabel?: string, highLabel?: string, examples?: string[] }>, questions: Array<single_choice | multiple_choice | open_text>, resultDebugPrompt: string }. Choice questions use { id, title, type: 'single_choice' | 'multiple_choice', options: Array<{ id, label, deltaVector, formula?: null }> }. Open questions use { id, title, type: 'open_text', scoringPrompt, scoreRange: { min, max } }. Use stable lowercase ids with underscores. Every deltaVector key must reference an existing dimension id. Do not include executable formulas; formula may only be null or omitted.",
    },
    {
      role: "user" as const,
      content: [
        "Turn the source text into a validated questionnaire schema draft.",
        modeInstructions[input.mode],
        title ? `Preferred title: ${title}` : "Infer a concise title from the source text.",
        description ? `Preferred description: ${description}` : "Infer a concise description from the source text.",
        scenario ? `Preferred scenario: ${scenario}` : "Infer a short scenario label from the source text.",
        "Keep the draft compact enough for an internal test: 2-5 dimensions and 4-10 questions.",
        "For open_text scoring prompts, instruct a later scorer to output deltaVector, confidence, and rationale, without diagnosis or deterministic career/school advice.",
        input.existingDraftSchema
          ? `Current saved/edited draft context, for reference only; return a full replacement schema if improvements are needed:\n${input.existingDraftSchema.trim().slice(0, 6_000)}`
          : "No existing draft context was provided.",
        "Source text:",
        input.sourceText.trim(),
      ].join("\n\n"),
    },
  ];
}

export async function generateQuestionnaireSchemaDraft(
  input: GenerateQuestionnaireSchemaDraftInput,
  callAi: AiCaller,
): Promise<GenerateQuestionnaireSchemaDraftResult> {
  const trimmedSource = input.sourceText.trim();

  if (trimmedSource.length < 20) {
    return {
      ok: false,
      error: "Source text must be at least 20 characters.",
      rawOutput: "",
      model: null,
      latencyMs: null,
      attempts: null,
    };
  }

  let result: AiChatCompletionResult;

  try {
    result = await callAi({
      purpose: "schema_draft_generation",
      inputSummary: `Schema draft generation (${input.mode}): ${summarizeSourceText(trimmedSource)}`,
      messages: buildQuestionnaireSchemaDraftMessages({
        ...input,
        sourceText: trimmedSource,
      }),
      temperature: 0.2,
      maxTokens: 4_000,
      responseFormat: "json_object",
      thinking: "disabled",
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "AI schema draft generation failed.",
      rawOutput: "",
      model: null,
      latencyMs: null,
      attempts: null,
    };
  }

  try {
    const parsed = parseAiJsonWithSchema(result.content, questionnaireSchema);
    const validation = validateQuestionnaireDraftText(formatQuestionnaireDraft(parsed));

    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        rawOutput: result.content,
        model: result.model,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
      };
    }

    return {
      ok: true,
      questionnaire: validation.questionnaire,
      draftText: validation.formattedJson,
      formattedJson: validation.formattedJson,
      rawOutput: result.content,
      model: result.model,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "AI output did not match the questionnaire schema.",
      rawOutput: result.content,
      model: result.model,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
    };
  }
}
