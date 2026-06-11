import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildQuestionnaireSchemaDraftMessages,
  generateQuestionnaireSchemaDraft,
} from "./schema-draft.ts";

const validDraft = {
  title: "Collaboration Style Check",
  description: "A compact internal questionnaire about collaboration habits.",
  scenario: "team workshop",
  dimensions: [
    {
      id: "focus",
      name: "Focus",
      description: "Preference for deep focused work.",
      lowLabel: "Flexible",
      highLabel: "Focused",
    },
    {
      id: "collaboration",
      name: "Collaboration",
      description: "Preference for shared discussion and feedback.",
      lowLabel: "Independent",
      highLabel: "Collaborative",
    },
  ],
  questions: [
    {
      id: "planning_style",
      title: "How do you usually start a complex task?",
      type: "single_choice",
      options: [
        {
          id: "outline_first",
          label: "I write a quick outline.",
          deltaVector: {
            focus: 2,
          },
        },
        {
          id: "talk_first",
          label: "I discuss it with someone first.",
          deltaVector: {
            collaboration: 2,
          },
        },
      ],
    },
    {
      id: "open_reflection",
      title: "Describe a recent collaboration that worked well.",
      type: "open_text",
      scoringPrompt: "Score how the answer reflects focus and collaboration. Return deltaVector, confidence, and rationale.",
      scoreRange: {
        min: -2,
        max: 2,
      },
    },
  ],
  resultDebugPrompt: "Summarize collaboration style without diagnosis or deterministic advice.",
};

describe("schema draft generation", () => {
  it("builds prompts that request JSON-only questionnaire output", () => {
    const messages = buildQuestionnaireSchemaDraftMessages({
      sourceText: "This workshop measures focus, collaboration, and reflective learning habits.",
      mode: "scoring_vectors",
      title: "Workshop Check",
      description: "Internal workshop questionnaire",
      scenario: "team workshop",
      existingDraftSchema: JSON.stringify(validDraft),
    });

    assert.equal(messages.length, 2);
    assert.match(messages[0].content, /Return only valid JSON/);
    assert.match(messages[0].content, /formula may only be null or omitted/);
    assert.match(messages[1].content, /Focus on choice options and deltaVector scoring/);
    assert.match(messages[1].content, /Preferred title: Workshop Check/);
    assert.match(messages[1].content, /Current saved\/edited draft context/);
  });

  it("returns a formatted validated draft without writing anything itself", async () => {
    const calls = [];
    const result = await generateQuestionnaireSchemaDraft(
      {
        sourceText: "This source text describes collaboration habits, focused work, and how people reflect on team practice.",
        mode: "document_to_schema",
      },
      async (input) => {
        calls.push(input);

        return {
          content: JSON.stringify(validDraft),
          model: "test-model",
          latencyMs: 42,
          attempts: 1,
        };
      },
    );

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    assert.equal(calls.length, 1);
    assert.equal(calls[0].purpose, "schema_draft_generation");
    assert.match(calls[0].inputSummary, /Schema draft generation/);
    assert.equal(calls[0].responseFormat, "json_object");
    assert.equal(calls[0].thinking, "disabled");
    assert.equal(result.model, "test-model");
    assert.equal(result.latencyMs, 42);
    assert.equal(result.attempts, 1);
    assert.equal(result.questionnaire.title, "Collaboration Style Check");
    assert.equal(result.formattedJson.endsWith("\n"), true);
    assert.deepEqual(JSON.parse(result.formattedJson), validDraft);
  });

  it("returns validation errors and raw AI output for invalid questionnaire JSON", async () => {
    const rawOutput = JSON.stringify({
      ...validDraft,
      questions: [
        {
          id: "bad_choice",
          title: "Bad choice",
          type: "single_choice",
          options: [
            {
              id: "unknown_dimension",
              label: "Unknown dimension",
              deltaVector: {
                missing_dimension: 1,
              },
            },
          ],
        },
      ],
    });

    const result = await generateQuestionnaireSchemaDraft(
      {
        sourceText: "This source text is long enough to request a generated questionnaire draft from the AI helper.",
        mode: "document_to_schema",
      },
      async () => ({
        content: rawOutput,
        model: "test-model",
        latencyMs: 30,
        attempts: 1,
      }),
    );

    assert.equal(result.ok, false);

    if (result.ok) {
      return;
    }

    assert.equal(result.rawOutput, rawOutput);
    assert.match(result.error, /Unknown deltaVector dimension id/);
    assert.equal(result.model, "test-model");
  });

  it("returns raw malformed output when the AI response is not JSON", async () => {
    const result = await generateQuestionnaireSchemaDraft(
      {
        sourceText: "This source text is long enough to request a generated questionnaire draft from the AI helper.",
        mode: "open_scoring_prompts",
      },
      async () => ({
        content: "not-json",
        model: "test-model",
        latencyMs: 12,
        attempts: 1,
      }),
    );

    assert.equal(result.ok, false);

    if (result.ok) {
      return;
    }

    assert.equal(result.rawOutput, "not-json");
    assert.match(result.error, /Unexpected token/);
    assert.equal(result.model, "test-model");
  });

  it("rejects short source text before calling AI", async () => {
    let called = false;
    const result = await generateQuestionnaireSchemaDraft(
      {
        sourceText: "too short",
        mode: "document_to_schema",
      },
      async () => {
        called = true;
        throw new Error("should not call AI");
      },
    );

    assert.equal(result.ok, false);
    assert.equal(called, false);

    if (!result.ok) {
      assert.match(result.error, /at least 20 characters/);
    }
  });
});
