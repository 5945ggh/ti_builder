import { z } from "zod";

const idSchema = z.string().trim().min(1);
const nonEmptyTextSchema = z.string().trim().min(1);
const deltaVectorSchema = z.record(idSchema, z.number().finite());
const scoreRangeSchema = z
  .object({
    min: z.number().finite(),
    max: z.number().finite(),
  })
  .superRefine((range, ctx) => {
    if (range.min > range.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scoreRange.min must be less than or equal to scoreRange.max",
        path: ["min"],
      });
    }
  });

export const questionnaireDimensionSchema = z.object({
  id: idSchema,
  name: nonEmptyTextSchema,
  description: nonEmptyTextSchema,
  lowLabel: z.string().optional(),
  highLabel: z.string().optional(),
  examples: z.array(z.string()).optional(),
});

export const choiceOptionSchema = z.object({
  id: idSchema,
  label: nonEmptyTextSchema,
  deltaVector: deltaVectorSchema,
  formula: z.null().optional(),
});

const baseQuestionSchema = z.object({
  id: idSchema,
  title: nonEmptyTextSchema,
});

export const singleChoiceQuestionSchema = baseQuestionSchema.extend({
  type: z.literal("single_choice"),
  options: z.array(choiceOptionSchema).min(1),
});

export const multipleChoiceQuestionSchema = baseQuestionSchema.extend({
  type: z.literal("multiple_choice"),
  options: z.array(choiceOptionSchema).min(1),
});

export const openTextQuestionSchema = baseQuestionSchema.extend({
  type: z.literal("open_text"),
  scoringPrompt: nonEmptyTextSchema,
  scoreRange: scoreRangeSchema,
});

export const questionnaireQuestionSchema = z.discriminatedUnion("type", [
  singleChoiceQuestionSchema,
  multipleChoiceQuestionSchema,
  openTextQuestionSchema,
]);

export const questionnaireSchema = z
  .object({
    title: nonEmptyTextSchema,
    description: z.string(),
    scenario: z.string(),
    dimensions: z.array(questionnaireDimensionSchema).min(1),
    questions: z.array(questionnaireQuestionSchema).min(1),
    resultDebugPrompt: z.string(),
  })
  .superRefine((questionnaire, ctx) => {
    const dimensionIds = new Set<string>();

    questionnaire.dimensions.forEach((dimension, index) => {
      if (dimensionIds.has(dimension.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate dimension id: ${dimension.id}`,
          path: ["dimensions", index, "id"],
        });
        return;
      }

      dimensionIds.add(dimension.id);
    });

    const questionIds = new Set<string>();

    questionnaire.questions.forEach((question, questionIndex) => {
      if (questionIds.has(question.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate question id: ${question.id}`,
          path: ["questions", questionIndex, "id"],
        });
      } else {
        questionIds.add(question.id);
      }

      if (question.type === "open_text") {
        return;
      }

      const optionIds = new Set<string>();

      question.options.forEach((option, optionIndex) => {
        if (optionIds.has(option.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate option id in question ${question.id}: ${option.id}`,
            path: ["questions", questionIndex, "options", optionIndex, "id"],
          });
        } else {
          optionIds.add(option.id);
        }

        Object.keys(option.deltaVector).forEach((dimensionId) => {
          if (!dimensionIds.has(dimensionId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Unknown deltaVector dimension id: ${dimensionId}`,
              path: ["questions", questionIndex, "options", optionIndex, "deltaVector", dimensionId],
            });
          }
        });
      });
    });
  });

export const openAnswerScoringOutputSchema = z.object({
  deltaVector: deltaVectorSchema,
  confidence: z.number().finite().min(0).max(1),
  rationale: z.string(),
});

export type QuestionnaireDimension = z.infer<typeof questionnaireDimensionSchema>;
export type ChoiceOption = z.infer<typeof choiceOptionSchema>;
export type SingleChoiceQuestion = z.infer<typeof singleChoiceQuestionSchema>;
export type MultipleChoiceQuestion = z.infer<typeof multipleChoiceQuestionSchema>;
export type OpenTextQuestion = z.infer<typeof openTextQuestionSchema>;
export type QuestionnaireQuestion = z.infer<typeof questionnaireQuestionSchema>;
export type QuestionnaireSchema = z.infer<typeof questionnaireSchema>;
export type OpenAnswerScoringOutput = z.infer<typeof openAnswerScoringOutputSchema>;

export function parseQuestionnaireSchema(input: unknown): QuestionnaireSchema {
  return questionnaireSchema.parse(input);
}

export function validateQuestionnaireSchema(input: unknown): z.SafeParseReturnType<unknown, QuestionnaireSchema> {
  return questionnaireSchema.safeParse(input);
}

export function getOpenTextQuestion(
  questionnaire: QuestionnaireSchema,
  questionId: string,
): OpenTextQuestion | undefined {
  return questionnaire.questions.find(
    (question): question is OpenTextQuestion => question.id === questionId && question.type === "open_text",
  );
}

export function createOpenAnswerScoringOutputSchema(
  questionnaire: QuestionnaireSchema,
  openQuestion: OpenTextQuestion,
) {
  const dimensionIds = new Set(questionnaire.dimensions.map((dimension) => dimension.id));
  const { min, max } = openQuestion.scoreRange;

  return openAnswerScoringOutputSchema.superRefine((output, ctx) => {
    Object.entries(output.deltaVector).forEach(([dimensionId, value]) => {
      if (!dimensionIds.has(dimensionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown open scoring dimension id: ${dimensionId}`,
          path: ["deltaVector", dimensionId],
        });
      }

      if (value < min || value > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Open scoring value for ${dimensionId} must be between ${min} and ${max}`,
          path: ["deltaVector", dimensionId],
        });
      }
    });
  });
}

export function createOpenAnswerScoringOutputSchemaForQuestion(
  questionnaireInput: unknown,
  questionId: string,
) {
  const questionnaire = parseQuestionnaireSchema(questionnaireInput);
  const openQuestion = getOpenTextQuestion(questionnaire, questionId);

  if (!openQuestion) {
    throw new Error(`Open text question not found: ${questionId}`);
  }

  return createOpenAnswerScoringOutputSchema(questionnaire, openQuestion);
}

export function parseOpenAnswerScoringOutput(
  questionnaire: QuestionnaireSchema,
  openQuestion: OpenTextQuestion,
  input: unknown,
): OpenAnswerScoringOutput {
  return createOpenAnswerScoringOutputSchema(questionnaire, openQuestion).parse(input);
}

export function validateOpenAnswerScoringOutput(
  questionnaire: QuestionnaireSchema,
  openQuestion: OpenTextQuestion,
  input: unknown,
): z.SafeParseReturnType<unknown, OpenAnswerScoringOutput> {
  return createOpenAnswerScoringOutputSchema(questionnaire, openQuestion).safeParse(input);
}
