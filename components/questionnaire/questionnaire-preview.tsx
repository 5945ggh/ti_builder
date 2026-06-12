"use client";

import { useMemo, useState } from "react";
import type { QuestionnaireSchema } from "@/lib/schema/questionnaire";

type QuestionnairePreviewProps = {
  questionnaire: QuestionnaireSchema;
  mode?: "read-only";
};

function summarizePrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "未提供评分 prompt。";
  }

  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

export function QuestionnairePreview({ questionnaire }: QuestionnairePreviewProps) {
  const [previewMode, setPreviewMode] = useState<"design" | "tester">("design");

  // Map dimension IDs to their display names for visual delta vectors
  const dimensionMap = useMemo(() => {
    return new Map(questionnaire.dimensions.map((d) => [d.id, d.name]));
  }, [questionnaire.dimensions]);

  function renderDeltaVectorTags(deltaVector: Record<string, number>) {
    const entries = Object.entries(deltaVector);

    if (entries.length === 0) {
      return (
        <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontStyle: "italic" }}>
          无积分影响
        </span>
      );
    }

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "1px" }}>
        {entries.map(([dimId, val]) => {
          const dimName = dimensionMap.get(dimId) || dimId;
          const isPositive = val >= 0;
          const color = isPositive ? "var(--color-ok)" : "var(--color-danger)";

          return (
            <span
              key={dimId}
              style={{
                display: "inline-flex",
                alignItems: "center",
                color: color,
                fontSize: "11px",
                fontFamily: "var(--font-sans)",
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              <strong style={{ fontFamily: "var(--font-mono)", marginRight: "3px" }}>
                {isPositive ? "+" : ""}
                {val}
              </strong>
              <span>{dimName}</span>
              <span style={{ fontSize: "9px", opacity: 0.6, fontFamily: "var(--font-mono)", marginLeft: "2px" }}>
                ({dimId})
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <section className="preview" aria-label="Questionnaire preview">
      {/* View Switcher Tabs */}
      <div style={{
        display: "flex",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface-muted)",
        padding: "3px",
        borderRadius: "6px",
        marginBottom: "var(--space-2)"
      }}>
        <button
          type="button"
          onClick={() => setPreviewMode("design")}
          style={{
            flex: 1,
            padding: "6px 12px",
            border: "none",
            background: previewMode === "design" ? "var(--color-surface)" : "transparent",
            color: previewMode === "design" ? "var(--color-primary)" : "var(--color-text-muted)",
            fontFamily: "var(--font-display)",
            fontWeight: "bold",
            fontSize: "12px",
            borderRadius: "4px",
            cursor: "pointer",
            boxShadow: previewMode === "design" ? "1px 1px 2px rgba(0,0,0,0.05)" : "none"
          }}
        >
          设计模式 (显示计分)
        </button>
        <button
          type="button"
          onClick={() => setPreviewMode("tester")}
          style={{
            flex: 1,
            padding: "6px 12px",
            border: "none",
            background: previewMode === "tester" ? "var(--color-surface)" : "transparent",
            color: previewMode === "tester" ? "var(--color-primary)" : "var(--color-text-muted)",
            fontFamily: "var(--font-display)",
            fontWeight: "bold",
            fontSize: "12px",
            borderRadius: "4px",
            cursor: "pointer",
            boxShadow: previewMode === "tester" ? "1px 1px 2px rgba(0,0,0,0.05)" : "none"
          }}
        >
          答题模式 (作答效果)
        </button>
      </div>

      <div className="preview-header" style={{ padding: "var(--space-4)", gap: "var(--space-2)" }}>
        <p className="eyebrow">{previewMode === "design" ? "配置看板" : "测评体验"}</p>
        <h2 style={{ fontSize: "var(--text-lg)" }}>{questionnaire.title}</h2>
        {questionnaire.description ? (
          <p className="lead compact" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            {questionnaire.description}
          </p>
        ) : null}
        <dl className="meta-list" style={{ marginTop: "var(--space-2)", gap: "var(--space-2)" }}>
          {questionnaire.scenario ? (
            <div style={{ padding: "var(--space-2) var(--space-3)" }}>
              <dt style={{ fontSize: "10px" }}>场景</dt>
              <dd style={{ fontSize: "var(--text-sm)" }}>{questionnaire.scenario}</dd>
            </div>
          ) : null}
          <div style={{ padding: "var(--space-2) var(--space-3)" }}>
            <dt style={{ fontSize: "10px" }}>题目数</dt>
            <dd style={{ fontSize: "var(--text-sm)" }}>{questionnaire.questions.length}</dd>
          </div>
          {previewMode === "design" ? (
            <div style={{ padding: "var(--space-2) var(--space-3)" }}>
              <dt style={{ fontSize: "10px" }}>维度数</dt>
              <dd style={{ fontSize: "var(--text-sm)" }}>{questionnaire.dimensions.length}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* Hide Dimensions completely in tester/answering mode */}
      {previewMode === "design" && questionnaire.dimensions.length > 0 ? (
        <div className="preview-section" style={{ padding: "var(--space-4)", gap: "var(--space-3)" }}>
          <h3 style={{ fontSize: "var(--text-base)", borderBottom: "1px solid var(--color-border)", paddingBottom: "var(--space-2)" }}>
            测定维度
          </h3>
          <div className="dimension-list" style={{ gap: "0" }}>
            {questionnaire.dimensions.map((dimension) => (
              <article className="dimension-item" key={dimension.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "var(--text-sm)" }}>{dimension.name}</strong>
                  <code style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{dimension.id}</code>
                </div>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  {dimension.description}
                </p>
                {dimension.lowLabel || dimension.highLabel ? (
                  <div style={{ fontSize: "11px", color: "var(--color-accent)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                    {dimension.lowLabel ? `MIN: ${dimension.lowLabel}` : null}
                    {dimension.lowLabel && dimension.highLabel ? " · " : null}
                    {dimension.highLabel ? `MAX: ${dimension.highLabel}` : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="preview-section" style={{ padding: "var(--space-4)", gap: "var(--space-3)" }}>
        <h3 style={{ fontSize: "var(--text-base)", borderBottom: "1px solid var(--color-border)", paddingBottom: "var(--space-2)" }}>
          {previewMode === "design" ? "计问题目" : "答题流程"}
        </h3>
        <div className="question-list" style={{ gap: "var(--space-3)" }}>
          {questionnaire.questions.map((question, index) => (
            <article className="question-item" key={question.id} style={{ padding: "var(--space-3)", gap: "var(--space-2)" }}>
              <div className="question-heading" style={{ gap: "var(--space-2)" }}>
                <span
                  className="badge subtle"
                  style={{
                    minWidth: "28px",
                    height: "22px",
                    justifyContent: "center",
                    padding: "0 4px",
                    fontSize: "10px",
                    alignSelf: "flex-start",
                  }}
                >
                  Q{index + 1}
                </span>
                <div>
                  <h4 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 700 }}>{question.title}</h4>
                  {previewMode === "design" ? (
                    <code style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                      {question.id} · {question.type}
                    </code>
                  ) : null}
                </div>
              </div>

              {question.type === "open_text" ? (
                <div className="open-preview" style={{ gap: "var(--space-2)" }}>
                  <textarea disabled placeholder="[开放性文本作答区域]" rows={3} style={{ fontSize: "12px", minHeight: "60px", background: "var(--color-surface)" }} />
                  {previewMode === "design" ? (
                    <dl className="meta-list compact-meta" style={{ gridTemplateColumns: "1fr 2fr", gap: "var(--space-2)", marginTop: 0 }}>
                      <div style={{ padding: "var(--space-1) var(--space-2)" }}>
                        <dt style={{ fontSize: "9px" }}>打分区间</dt>
                        <dd style={{ fontSize: "12px" }}>
                          {question.scoreRange.min} ~ {question.scoreRange.max}
                        </dd>
                      </div>
                      <div style={{ padding: "var(--space-1) var(--space-2)" }}>
                        <dt style={{ fontSize: "9px" }}>评分 Prompt</dt>
                        <dd style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-sans)", fontWeight: "normal" }}>
                          {summarizePrompt(question.scoringPrompt)}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                </div>
              ) : (
                <div className="option-list" style={{ gap: "var(--space-2)", marginTop: "2px" }}>
                  {question.options.map((option) => (
                    <div className="option-item" key={option.id} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
                        {previewMode === "design" ? (
                          <>
                            <code
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                color: "var(--color-accent)",
                                fontWeight: "bold",
                              }}
                            >
                              {option.id}
                            </code>
                            <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>·</span>
                          </>
                        ) : (
                          <span style={{
                            fontSize: "12px",
                            fontFamily: "var(--font-mono)",
                            color: "var(--color-text-muted)",
                            marginRight: "2px"
                          }}>
                            {question.type === "multiple_choice" ? "☐" : "○"}
                          </span>
                        )}
                        <span style={{ fontSize: "12px", color: "var(--color-text)", fontWeight: 600 }}>
                          {option.label}
                        </span>
                      </div>
                      {previewMode === "design" ? (
                        <div style={{ paddingLeft: "16px" }}>
                          {renderDeltaVectorTags(option.deltaVector)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>

      {previewMode === "design" && questionnaire.resultDebugPrompt ? (
        <div className="preview-section" style={{ padding: "var(--space-4)", gap: "var(--space-2)" }}>
          <h3 style={{ fontSize: "var(--text-base)", borderBottom: "1px solid var(--color-border)", paddingBottom: "var(--space-2)" }}>
            结果解读 Prompt
          </h3>
          <p
            className="prompt-summary"
            style={{
              margin: 0,
              fontSize: "11px",
              fontFamily: "var(--font-sans)",
              color: "var(--color-text-muted)",
              background: "var(--color-surface-muted)",
              padding: "var(--space-2) var(--space-3)",
            }}
          >
            {summarizePrompt(questionnaire.resultDebugPrompt)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
