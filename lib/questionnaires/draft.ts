import type { QuestionnaireSchema } from "../schema/questionnaire.ts";
import { validateQuestionnaireSchema } from "../schema/questionnaire.ts";

export type DraftValidationResult =
  | {
      ok: true;
      questionnaire: QuestionnaireSchema;
      formattedJson: string;
    }
  | {
      ok: false;
      error: string;
    };

export function createInitialQuestionnaireDraft(input: {
  title: string;
  description: string;
  scenario: string;
}): QuestionnaireSchema {
  return {
    title: input.title,
    description: input.description,
    scenario: input.scenario,
    dimensions: [
      {
        id: "primary",
        name: "Primary",
        description: "Primary measurement dimension. Rename this before publishing.",
        lowLabel: "Low",
        highLabel: "High",
      },
    ],
    questions: [
      {
        id: "q1",
        title: "Replace this starter question.",
        type: "single_choice",
        options: [
          {
            id: "a",
            label: "Starter option",
            deltaVector: {
              primary: 1,
            },
          },
        ],
      },
    ],
    resultDebugPrompt: "",
  };
}

export function formatQuestionnaireDraft(questionnaire: QuestionnaireSchema): string {
  return `${JSON.stringify(questionnaire, null, 2)}\n`;
}

export function validateQuestionnaireDraftText(schemaText: string): DraftValidationResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(schemaText);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `JSON parse error: ${error.message}` : "JSON parse error.",
    };
  }

  const parsedSchema = validateQuestionnaireSchema(parsedJson);

  if (!parsedSchema.success) {
    return {
      ok: false,
      error: parsedSchema.error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          return `${path}: ${issue.message}`;
        })
        .join("\n"),
    };
  }

  return {
    ok: true,
    questionnaire: parsedSchema.data,
    formattedJson: formatQuestionnaireDraft(parsedSchema.data),
  };
}
