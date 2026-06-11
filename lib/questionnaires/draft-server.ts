import "server-only";
import { eq } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { questionnaires } from "../db/schema.ts";
import { validateQuestionnaireDraftText } from "./draft.ts";

export type ConfirmQuestionnaireDraftUpdateResult =
  | {
      ok: true;
      draftText: string;
    }
  | {
      ok: false;
      error: string;
    };

export function confirmQuestionnaireDraftUpdate(
  db: AppDb,
  input: {
    questionnaireId: string;
    schemaText: string;
    now?: Date;
  },
): ConfirmQuestionnaireDraftUpdateResult {
  const validation = validateQuestionnaireDraftText(input.schemaText);

  if (!validation.ok) {
    return validation;
  }

  const result = db
    .update(questionnaires)
    .set({
      title: validation.questionnaire.title,
      description: validation.questionnaire.description,
      scenario: validation.questionnaire.scenario,
      updatedAt: input.now ?? new Date(),
      currentDraftSchema: validation.formattedJson,
    })
    .where(eq(questionnaires.id, input.questionnaireId))
    .run();

  if (result.changes === 0) {
    return {
      ok: false,
      error: "Questionnaire not found.",
    };
  }

  return {
    ok: true,
    draftText: validation.formattedJson,
  };
}
