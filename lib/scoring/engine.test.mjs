import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scoreQuestionnaire } from "./engine.ts";

function questionnaire() {
  return {
    title: "Scoring engine test",
    description: "Focused scoring cases",
    scenario: "internal",
    dimensions: [
      {
        id: "focus",
        name: "Focus",
        description: "Focus dimension",
      },
      {
        id: "risk",
        name: "Risk",
        description: "Risk dimension",
      },
    ],
    questions: [
      {
        id: "single",
        title: "Single choice",
        type: "single_choice",
        options: [
          {
            id: "single_low",
            label: "Low",
            deltaVector: {
              focus: -1,
              risk: 2,
            },
          },
          {
            id: "single_high",
            label: "High",
            deltaVector: {
              focus: 3,
              risk: -2,
            },
          },
        ],
      },
      {
        id: "multi",
        title: "Multiple choice",
        type: "multiple_choice",
        options: [
          {
            id: "multi_focus",
            label: "Focus",
            deltaVector: {
              focus: 2,
            },
          },
          {
            id: "multi_risk",
            label: "Risk",
            deltaVector: {
              risk: -3,
            },
          },
          {
            id: "multi_both",
            label: "Both",
            deltaVector: {
              focus: -4,
              risk: 1,
            },
          },
        ],
      },
      {
        id: "open",
        title: "Open text",
        type: "open_text",
        scoringPrompt: "Score the answer.",
        scoreRange: {
          min: -2,
          max: 2,
        },
      },
    ],
    resultDebugPrompt: "",
  };
}

describe("scoreQuestionnaire", () => {
  it("sums single choice deltas into the final vector", () => {
    const result = scoreQuestionnaire(questionnaire(), {
      single: "single_high",
    });

    assert.deepEqual(result.finalVector, {
      focus: 3,
      risk: -2,
    });
    assert.deepEqual(result.perQuestionScores[0].deltaVector, {
      focus: 3,
      risk: -2,
    });
  });

  it("sums all selected multiple choice option deltas", () => {
    const result = scoreQuestionnaire(questionnaire(), {
      multi: ["multi_focus", "multi_risk", "multi_both"],
    });

    assert.deepEqual(result.finalVector, {
      focus: -2,
      risk: -2,
    });
    assert.deepEqual(result.perQuestionScores[1].selectedOptionIds, ["multi_focus", "multi_risk", "multi_both"]);
  });

  it("keeps missing answers as zero-delta per-question scores", () => {
    const result = scoreQuestionnaire(questionnaire(), {});

    assert.deepEqual(result.finalVector, {
      focus: 0,
      risk: 0,
    });
    assert.equal(result.perQuestionScores.length, 3);
    assert.equal(result.perQuestionScores[0].missing, true);
    assert.deepEqual(result.perQuestionScores[0].deltaVector, {
      focus: 0,
      risk: 0,
    });
  });

  it("reports unknown options without adding their deltas", () => {
    const result = scoreQuestionnaire(questionnaire(), {
      single: "unknown_single",
      multi: ["multi_focus", "unknown_multi"],
    });

    assert.deepEqual(result.finalVector, {
      focus: 2,
      risk: 0,
    });
    assert.deepEqual(result.perQuestionScores[0].unknownOptionIds, ["unknown_single"]);
    assert.deepEqual(result.perQuestionScores[1].unknownOptionIds, ["unknown_multi"]);
  });

  it("derives theoretical ranges and normalized values from choice and open ranges", () => {
    const result = scoreQuestionnaire(
      questionnaire(),
      {
        single: "single_high",
        multi: ["multi_focus", "multi_risk"],
        open: "Open answer",
      },
      {
        open: {
          deltaVector: {
            focus: 1,
            risk: -1,
          },
          confidence: 0.8,
          rationale: "Stubbed AI score.",
        },
      },
    );

    assert.deepEqual(result.theoreticalRanges, {
      focus: {
        dimensionId: "focus",
        min: -7,
        max: 7,
        derivable: true,
      },
      risk: {
        dimensionId: "risk",
        min: -7,
        max: 5,
        derivable: true,
      },
    });
    assert.deepEqual(result.finalVector, {
      focus: 6,
      risk: -6,
    });
    assert.equal(result.normalizedVector.focus?.normalized, 13 / 14);
    assert.equal(result.normalizedVector.risk?.normalized, 1 / 12);
  });

  it("does not read or execute option formulas", () => {
    const withExplosiveFormula = questionnaire();

    Object.defineProperty(withExplosiveFormula.questions[0].options[1], "formula", {
      enumerable: true,
      get() {
        throw new Error("formula must not be read");
      },
    });

    const result = scoreQuestionnaire(withExplosiveFormula, {
      single: "single_high",
    });

    assert.deepEqual(result.finalVector, {
      focus: 3,
      risk: -2,
    });
  });
});
