import type { QuestionnaireSchema } from "@/lib/schema/questionnaire";

type QuestionnairePreviewProps = {
  questionnaire: QuestionnaireSchema;
  mode?: "read-only";
};

function formatDeltaVector(deltaVector: Record<string, number>) {
  const entries = Object.entries(deltaVector);

  if (entries.length === 0) {
    return "No vector contribution";
  }

  return entries.map(([dimensionId, value]) => `${dimensionId}: ${value >= 0 ? "+" : ""}${value}`).join(", ");
}

function summarizePrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "No scoring prompt provided.";
  }

  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

export function QuestionnairePreview({ questionnaire }: QuestionnairePreviewProps) {
  return (
    <section className="preview" aria-label="Questionnaire preview">
      <div className="preview-header">
        <p className="eyebrow">Read-only Preview</p>
        <h2>{questionnaire.title}</h2>
        <p className="lead compact">{questionnaire.description || "No description."}</p>
        <dl className="meta-list">
          <div>
            <dt>Scenario</dt>
            <dd>{questionnaire.scenario || "Not set"}</dd>
          </div>
          <div>
            <dt>Questions</dt>
            <dd>{questionnaire.questions.length}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>{questionnaire.dimensions.length}</dd>
          </div>
        </dl>
      </div>

      <div className="preview-section">
        <h3>Dimensions</h3>
        <div className="dimension-list">
          {questionnaire.dimensions.map((dimension) => (
            <article className="dimension-item" key={dimension.id}>
              <div>
                <strong>{dimension.name}</strong>
                <span className="muted-code">{dimension.id}</span>
              </div>
              <p>{dimension.description}</p>
              <p className="muted">
                Low: {dimension.lowLabel || "not set"} · High: {dimension.highLabel || "not set"}
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="preview-section">
        <h3>Questions</h3>
        <div className="question-list">
          {questionnaire.questions.map((question, index) => (
            <article className="question-item" key={question.id}>
              <div className="question-heading">
                <span className="badge subtle">Q{index + 1}</span>
                <div>
                  <h4>{question.title}</h4>
                  <p className="muted-code">
                    {question.id} · {question.type}
                  </p>
                </div>
              </div>

              {question.type === "open_text" ? (
                <div className="open-preview">
                  <textarea disabled placeholder="Open answer text area preview" rows={4} />
                  <dl className="meta-list compact-meta">
                    <div>
                      <dt>Score range</dt>
                      <dd>
                        {question.scoreRange.min} to {question.scoreRange.max}
                      </dd>
                    </div>
                    <div>
                      <dt>Scoring prompt summary</dt>
                      <dd>{summarizePrompt(question.scoringPrompt)}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="option-list">
                  {question.options.map((option) => (
                    <div className="option-item" key={option.id}>
                      <div>
                        <strong>{option.label}</strong>
                        <span className="muted-code">{option.id}</span>
                      </div>
                      <code>{formatDeltaVector(option.deltaVector)}</code>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>

      {questionnaire.resultDebugPrompt ? (
        <div className="preview-section">
          <h3>Result Debug Prompt</h3>
          <p className="prompt-summary">{summarizePrompt(questionnaire.resultDebugPrompt)}</p>
        </div>
      ) : null}
    </section>
  );
}
