import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOpenAnswerScoringOutputSchemaForQuestion,
  parseQuestionnaireSchema,
  validateOpenAnswerScoringOutput,
  validateQuestionnaireSchema,
} from "./questionnaire.ts";

const validQuestionnaire = {
  title: "Major exploration",
  description: "Internal validation questionnaire",
  scenario: "hybrid_gaokao_major_exploration",
  dimensions: [
    {
      id: "analytical",
      name: "Analytical",
      description: "Structured problem solving",
      lowLabel: "Experiential",
      highLabel: "Logical",
      examples: ["finds patterns", "breaks down problems"],
    },
    {
      id: "creative",
      name: "Creative",
      description: "Original expression and ideation",
    },
  ],
  questions: [
    {
      id: "q1",
      type: "single_choice",
      title: "How do you approach an unfamiliar problem?",
      options: [
        {
          id: "a",
          label: "Find the structure first",
          deltaVector: {
            analytical: 2,
            creative: -0.5,
          },
          formula: null,
        },
        {
          id: "b",
          label: "Try several intuitive ideas",
          deltaVector: {
            analytical: -0.5,
            creative: 2,
          },
        },
      ],
    },
    {
      id: "q2",
      type: "multiple_choice",
      title: "Which activities feel natural?",
      options: [
        {
          id: "a",
          label: "Comparing evidence",
          deltaVector: {
            analytical: 1,
          },
        },
        {
          id: "b",
          label: "Inventing alternatives",
          deltaVector: {
            creative: 1.5,
          },
        },
      ],
    },
    {
      id: "q3",
      type: "open_text",
      title: "Describe a difficult choice.",
      scoringPrompt: "Evaluate the answer as dimension deltas.",
      scoreRange: {
        min: -2,
        max: 2,
      },
    },
  ],
  resultDebugPrompt: "Summarize the vector for internal debugging.",
};

function withQuestionnaireChange(mutator) {
  const draft = structuredClone(validQuestionnaire);
  mutator(draft);
  return draft;
}

function getOptionFixture(draft, questionIndex, optionIndex) {
  const option = draft.questions[questionIndex]?.options?.[optionIndex];

  if (!option) {
    throw new Error(`Missing option fixture at questions[${questionIndex}].options[${optionIndex}]`);
  }

  return option;
}

describe("questionnaireSchema", () => {
  it("accepts a valid mixed questionnaire schema", () => {
    const result = validateQuestionnaireSchema(validQuestionnaire);

    assert.equal(result.success, true);
  });

  it("rejects duplicate dimension IDs", () => {
    const result = validateQuestionnaireSchema(
      withQuestionnaireChange((draft) => {
        draft.dimensions[1].id = "analytical";
      }),
    );

    assert.equal(result.success, false);
    assert.match(result.error.message, /Duplicate dimension id/);
  });

  it("rejects duplicate question IDs", () => {
    const result = validateQuestionnaireSchema(
      withQuestionnaireChange((draft) => {
        draft.questions[1].id = "q1";
      }),
    );

    assert.equal(result.success, false);
    assert.match(result.error.message, /Duplicate question id/);
  });

  it("rejects duplicate option IDs within a choice question", () => {
    const result = validateQuestionnaireSchema(
      withQuestionnaireChange((draft) => {
        getOptionFixture(draft, 0, 1).id = "a";
      }),
    );

    assert.equal(result.success, false);
    assert.match(result.error.message, /Duplicate option id/);
  });

  it("rejects deltaVector keys that do not reference defined dimensions", () => {
    const result = validateQuestionnaireSchema(
      withQuestionnaireChange((draft) => {
        getOptionFixture(draft, 0, 0).deltaVector.unknown = 1;
      }),
    );

    assert.equal(result.success, false);
    assert.match(result.error.message, /Unknown deltaVector dimension id/);
  });

  it("rejects non-null choice option formulas", () => {
    const result = validateQuestionnaireSchema(
      withQuestionnaireChange((draft) => {
        getOptionFixture(draft, 0, 0).formula = "analytical * 2";
      }),
    );

    assert.equal(result.success, false);
    assert.match(result.error.message, /Expected null/);
  });
});

describe("open-answer scoring output validation", () => {
  const parsedQuestionnaire = parseQuestionnaireSchema(validQuestionnaire);
  const openQuestion = parsedQuestionnaire.questions.find((question) => question.type === "open_text");

  if (!openQuestion) {
    throw new Error("Expected open text question fixture");
  }

  it("accepts scoring output with known dimensions, range-safe values, and valid confidence", () => {
    const result = validateOpenAnswerScoringOutput(parsedQuestionnaire, openQuestion, {
      deltaVector: {
        analytical: 1.5,
        creative: -0.5,
      },
      confidence: 0.72,
      rationale: "The answer balances structured analysis with some intuitive language.",
    });

    assert.equal(result.success, true);
  });

  it("rejects unknown open scoring dimensions", () => {
    const result = validateOpenAnswerScoringOutput(parsedQuestionnaire, openQuestion, {
      deltaVector: {
        unknown: 1,
      },
      confidence: 0.72,
      rationale: "Uses an undefined dimension.",
    });

    assert.equal(result.success, false);
    assert.match(result.error.message, /Unknown open scoring dimension id/);
  });

  it("rejects out-of-range open scoring values", () => {
    const result = validateOpenAnswerScoringOutput(parsedQuestionnaire, openQuestion, {
      deltaVector: {
        analytical: 3,
      },
      confidence: 0.72,
      rationale: "Exceeds the configured range.",
    });

    assert.equal(result.success, false);
    assert.match(result.error.message, /must be between -2 and 2/);
  });

  it("rejects non-number open scoring values", () => {
    const result = validateOpenAnswerScoringOutput(parsedQuestionnaire, openQuestion, {
      deltaVector: {
        analytical: "high",
      },
      confidence: 0.72,
      rationale: "Uses a string instead of a number.",
    });

    assert.equal(result.success, false);
    assert.match(result.error.message, /Expected number/);
  });

  it("rejects invalid confidence values", () => {
    const result = validateOpenAnswerScoringOutput(parsedQuestionnaire, openQuestion, {
      deltaVector: {
        analytical: 1,
      },
      confidence: 1.2,
      rationale: "Confidence is out of bounds.",
    });

    assert.equal(result.success, false);
    assert.match(result.error.message, /less than or equal to 1/);
  });

  it("creates a question-specific scoring output schema from an unparsed questionnaire", () => {
    const scoringSchema = createOpenAnswerScoringOutputSchemaForQuestion(validQuestionnaire, "q3");

    assert.equal(
      scoringSchema.safeParse({
        deltaVector: {
          analytical: 0,
        },
        confidence: 0,
        rationale: "",
      }).success,
      true,
    );
  });
});
