import type { OpenAnswerScoringOutput, QuestionnaireSchema } from "../schema/questionnaire.ts";

export type AnswerValue = string | string[];
export type QuestionnaireAnswers = Record<string, AnswerValue>;
export type OpenAnswerScores = Record<string, OpenAnswerScoringOutput>;

export type DimensionRange = {
  dimensionId: string;
  min: number | null;
  max: number | null;
  derivable: boolean;
};

export type NormalizedDimensionScore = {
  raw: number;
  min: number;
  max: number;
  normalized: number;
};

export type PerQuestionScore = {
  questionId: string;
  questionTitle: string;
  questionType: QuestionnaireSchema["questions"][number]["type"];
  answer: AnswerValue | null;
  selectedOptionIds: string[];
  deltaVector: Record<string, number>;
  confidence?: number;
  rationale?: string;
  missing: boolean;
  unknownOptionIds: string[];
};

export type ScoringResult = {
  perQuestionScores: PerQuestionScore[];
  finalVector: Record<string, number>;
  theoreticalRanges: Record<string, DimensionRange>;
  normalizedVector: Record<string, NormalizedDimensionScore | null>;
};

function zeroVector(questionnaire: QuestionnaireSchema) {
  return Object.fromEntries(questionnaire.dimensions.map((dimension) => [dimension.id, 0]));
}

function addDelta(target: Record<string, number>, delta: Record<string, number>) {
  for (const [dimensionId, value] of Object.entries(delta)) {
    target[dimensionId] = (target[dimensionId] ?? 0) + value;
  }
}

function optionDeltaForDimension(option: { deltaVector: Record<string, number> }, dimensionId: string) {
  return option.deltaVector[dimensionId] ?? 0;
}

function deriveTheoreticalRanges(questionnaire: QuestionnaireSchema): Record<string, DimensionRange> {
  const ranges: Record<string, DimensionRange> = Object.fromEntries(
    questionnaire.dimensions.map((dimension) => [
      dimension.id,
      {
        dimensionId: dimension.id,
        min: 0,
        max: 0,
        derivable: true,
      },
    ]),
  );

  for (const question of questionnaire.questions) {
    for (const dimension of questionnaire.dimensions) {
      const range = ranges[dimension.id];

      if (question.type === "single_choice") {
        const deltas = question.options.map((option) => optionDeltaForDimension(option, dimension.id));
        range.min = (range.min ?? 0) + Math.min(...deltas);
        range.max = (range.max ?? 0) + Math.max(...deltas);
        continue;
      }

      if (question.type === "multiple_choice") {
        const deltas = question.options.map((option) => optionDeltaForDimension(option, dimension.id));
        range.min = (range.min ?? 0) + deltas.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
        range.max = (range.max ?? 0) + deltas.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
        continue;
      }

      if (!question.scoreRange) {
        range.min = null;
        range.max = null;
        range.derivable = false;
        continue;
      }

      if (range.derivable) {
        range.min = (range.min ?? 0) + question.scoreRange.min;
        range.max = (range.max ?? 0) + question.scoreRange.max;
      }
    }
  }

  return ranges;
}

function normalizeVector(
  finalVector: Record<string, number>,
  theoreticalRanges: Record<string, DimensionRange>,
): Record<string, NormalizedDimensionScore | null> {
  return Object.fromEntries(
    Object.entries(theoreticalRanges).map(([dimensionId, range]) => {
      const raw = finalVector[dimensionId] ?? 0;

      if (!range.derivable || range.min === null || range.max === null || range.max === range.min) {
        return [dimensionId, null];
      }

      return [
        dimensionId,
        {
          raw,
          min: range.min,
          max: range.max,
          normalized: (raw - range.min) / (range.max - range.min),
        },
      ];
    }),
  );
}

export function scoreQuestionnaire(
  questionnaire: QuestionnaireSchema,
  answers: QuestionnaireAnswers,
  openAnswerScores: OpenAnswerScores = {},
): ScoringResult {
  const finalVector = zeroVector(questionnaire);
  const perQuestionScores: PerQuestionScore[] = [];

  for (const question of questionnaire.questions) {
    const answer = answers[question.id];
    const questionScore: PerQuestionScore = {
      questionId: question.id,
      questionTitle: question.title,
      questionType: question.type,
      answer: answer ?? null,
      selectedOptionIds: [],
      deltaVector: zeroVector(questionnaire),
      missing: answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0),
      unknownOptionIds: [],
    };

    if (question.type === "single_choice") {
      if (typeof answer === "string" && answer) {
        const option = question.options.find((candidate) => candidate.id === answer);

        if (option) {
          questionScore.selectedOptionIds = [option.id];
          addDelta(questionScore.deltaVector, option.deltaVector);
        } else {
          questionScore.unknownOptionIds = [answer];
        }
      }
    } else if (question.type === "multiple_choice") {
      const selectedOptionIds = Array.isArray(answer) ? answer : [];
      const optionById = new Map(question.options.map((option) => [option.id, option]));

      questionScore.selectedOptionIds = selectedOptionIds.filter((optionId) => optionById.has(optionId));
      questionScore.unknownOptionIds = selectedOptionIds.filter((optionId) => !optionById.has(optionId));

      for (const optionId of questionScore.selectedOptionIds) {
        const option = optionById.get(optionId);

        if (option) {
          addDelta(questionScore.deltaVector, option.deltaVector);
        }
      }
    } else {
      const openScore = openAnswerScores[question.id];

      if (openScore) {
        addDelta(questionScore.deltaVector, openScore.deltaVector);
        questionScore.confidence = openScore.confidence;
        questionScore.rationale = openScore.rationale;
      }
    }

    addDelta(finalVector, questionScore.deltaVector);
    perQuestionScores.push(questionScore);
  }

  const theoreticalRanges = deriveTheoreticalRanges(questionnaire);

  return {
    perQuestionScores,
    finalVector,
    theoreticalRanges,
    normalizedVector: normalizeVector(finalVector, theoreticalRanges),
  };
}
