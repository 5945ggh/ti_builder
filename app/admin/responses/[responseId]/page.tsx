import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { createDb } from "@/lib/db/client";
import { feedback, members, questionnaireVersions, questionnaires, responses } from "@/lib/db/schema";
import {
  scoreQuestionnaire,
  type NormalizedDimensionScore,
  type PerQuestionScore,
  type QuestionnaireAnswers,
  type ScoringResult,
} from "@/lib/scoring/engine";
import { parseQuestionnaireSchema, type QuestionnaireSchema } from "@/lib/schema/questionnaire";
import { rescoreResponseAction } from "../actions";
import { FeedbackForm } from "./feedback-form";
import { ResponseScoringStatusPanel } from "./response-scoring-status-panel";

type InternalResultPageProps = {
  params: Promise<{
    responseId: string;
  }>;
  searchParams?: Promise<{
    rescore?: string;
    message?: string;
  }>;
};

type DimensionSummary = {
  id: string;
  name: string;
  description: string;
  raw: number;
  min: number | null;
  max: number | null;
  normalized: number | null;
};

function parseJson<T>(input: string | null): T | null {
  if (!input) {
    return null;
  }

  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function formatScore(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function formatNormalized(value: number | null) {
  return value === null ? "无法推导" : `${Math.round(value * 100)}%`;
}

function normalizeStoredVector(scoring: ScoringResult, finalVector: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(scoring.theoreticalRanges).map(([dimensionId, range]) => {
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
  ) as Record<string, NormalizedDimensionScore | null>;
}

function summarizeDimensions(questionnaire: QuestionnaireSchema, scoring: ScoringResult): DimensionSummary[] {
  return questionnaire.dimensions.map((dimension) => {
    const range = scoring.theoreticalRanges[dimension.id];
    const normalized = scoring.normalizedVector[dimension.id];

    return {
      id: dimension.id,
      name: dimension.name,
      description: dimension.description,
      raw: scoring.finalVector[dimension.id] ?? 0,
      min: range?.min ?? null,
      max: range?.max ?? null,
      normalized: normalized?.normalized ?? null,
    };
  });
}

function renderProgressBar(normalized: number | null) {
  if (normalized === null) return null;
  const percentage = Math.min(Math.max(normalized * 100, 0), 100);
  return (
    <div style={{
      width: "100%",
      height: "8px",
      backgroundColor: "var(--color-surface-subtle)",
      borderRadius: "4px",
      overflow: "hidden",
      marginTop: "var(--space-2)",
      marginBottom: "var(--space-2)",
      border: "1px solid var(--color-border)"
    }}>
      <div style={{
        width: `${percentage}%`,
        height: "100%",
        backgroundColor: "var(--color-accent)",
        borderRadius: "4px"
      }} />
    </div>
  );
}

function isMarkdownBlockStart(line: string) {
  return (
    /^```/.test(line) ||
    /^#{1,4}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line)
  );
}

function safeMarkdownHref(href: string) {
  const trimmed = href.trim();

  if (/^(https?:|mailto:|\/|#)/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const inlinePattern = /(`[^`]+`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const href = safeMarkdownHref(match[3]);

      if (href) {
        nodes.push(
          <a href={href} key={key} rel="noopener noreferrer" target={href.startsWith("#") || href.startsWith("/") ? undefined : "_blank"}>
            {renderInlineMarkdown(match[2], `${key}-link`)}
          </a>,
        );
      } else {
        nodes.push(match[2]);
      }
    } else if (match[4] !== undefined) {
      nodes.push(<strong key={key}>{renderInlineMarkdown(match[4], `${key}-strong`)}</strong>);
    } else if (match[5] !== undefined) {
      nodes.push(<em key={key}>{renderInlineMarkdown(match[5], `${key}-em`)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMarkdownText(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = line.match(/^```\s*([\w-]+)?\s*$/);
    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        <pre data-language={fenceMatch[1] ?? undefined} key={`code-${blocks.length}`}>
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const content = renderInlineMarkdown(headingMatch[2].trim(), `heading-${blocks.length}`);
      const HeadingTag = headingMatch[1].length <= 2 ? "h3" : "h4";

      blocks.push(<HeadingTag key={`heading-${blocks.length}`}>{content}</HeadingTag>);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push(
        <blockquote key={`quote-${blocks.length}`}>
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={quoteIndex}>{renderInlineMarkdown(quoteLine, `quote-${blocks.length}-${quoteIndex}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineMarkdown(item, `ul-${blocks.length}-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ol key={`ol-${blocks.length}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineMarkdown(item, `ol-${blocks.length}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [line.trim()];
    index += 1;

    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push(
      <p key={`p-${blocks.length}`}>
        {renderInlineMarkdown(paragraphLines.join(" "), `p-${blocks.length}`)}
      </p>,
    );
  }

  return blocks;
}

export default async function InternalResultPage({ params, searchParams }: InternalResultPageProps) {
  const { responseId } = await params;
  const rescoreNotice = await searchParams;
  const db = createDb();
  const item = db
    .select({
      responseId: responses.id,
      questionnaireId: responses.questionnaireId,
      versionId: responses.versionId,
      resultToken: responses.resultToken,
      respondentName: responses.respondentName,
      respondentNote: responses.respondentNote,
      answers: responses.answers,
      perQuestionScores: responses.perQuestionScores,
      finalVector: responses.finalVector,
      debugInterpretation: responses.debugInterpretation,
      aiScoringStatus: responses.aiScoringStatus,
      aiScoringError: responses.aiScoringError,
      createdAt: responses.createdAt,
      memberName: members.name,
      questionnaireTitle: questionnaires.title,
      versionNumber: questionnaireVersions.versionNumber,
      schemaSnapshot: questionnaireVersions.schemaSnapshot,
    })
    .from(responses)
    .innerJoin(questionnaireVersions, eq(responses.versionId, questionnaireVersions.id))
    .innerJoin(questionnaires, eq(responses.questionnaireId, questionnaires.id))
    .leftJoin(members, eq(responses.memberId, members.id))
    .where(eq(responses.id, responseId))
    .get();

  if (!item) {
    notFound();
  }

  let questionnaire: QuestionnaireSchema | null = null;
  let scoring: ScoringResult | null = null;
  let storedPerQuestionScores: PerQuestionScore[] | null = null;
  let storedFinalVector: Record<string, number> | null = null;
  let answers: QuestionnaireAnswers | null = null;

  try {
    questionnaire = parseQuestionnaireSchema(JSON.parse(item.schemaSnapshot));
    answers = parseJson<QuestionnaireAnswers>(item.answers);
    storedPerQuestionScores = parseJson<PerQuestionScore[]>(item.perQuestionScores);
    storedFinalVector = parseJson<Record<string, number>>(item.finalVector);

    const computedScoring = scoreQuestionnaire(questionnaire, answers ?? {});

    if (storedPerQuestionScores) {
      computedScoring.perQuestionScores = storedPerQuestionScores;
    }

    if (storedFinalVector) {
      computedScoring.finalVector = storedFinalVector;
      computedScoring.normalizedVector = normalizeStoredVector(computedScoring, storedFinalVector);
    }

    scoring = computedScoring;
  } catch {
    questionnaire = null;
    scoring = null;
  }

  const dimensionSummaries =
    questionnaire && scoring
      ? summarizeDimensions(questionnaire, scoring).sort((left, right) => right.raw - left.raw)
      : [];
  const topDimensions = dimensionSummaries.slice(0, 3);
  const bottomDimensions = [...dimensionSummaries].sort((left, right) => left.raw - right.raw).slice(0, 3);
  const existingFeedback = db
    .select({
      interestScore: feedback.interestScore,
      accuracyScore: feedback.accuracyScore,
      shareWillingnessScore: feedback.shareWillingnessScore,
      usefulnessScore: feedback.usefulnessScore,
      comment: feedback.comment,
    })
    .from(feedback)
    .where(eq(feedback.responseId, item.responseId))
    .get();

  return (
    <main className="workspace wide">
      <header className="topbar">
        <div>
          <p className="eyebrow">[ EVALUATION_REPORT ]</p>
          <h1>
            {item.questionnaireTitle} · v{item.versionNumber}
          </h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href={`/admin/questionnaires/${item.questionnaireId}`}>
            返回问卷配置
          </Link>
          <Link
            className="button secondary"
            href={`/admin/questionnaires/${item.questionnaireId}/versions/${item.versionId}/answer`}
          >
            新录作答
          </Link>
          <Link className="button" href={`/api/admin/responses/${item.responseId}/export`}>
            导出 JSON 报告
          </Link>
        </div>
      </header>

      <section className="notice ok" style={{ marginBottom: "var(--space-4)", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <span style={{ fontFamily: "var(--font-mono)" }}>[RESPONSE_ID] {item.responseId}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>[RESULT_TOKEN] {item.resultToken}</span>
      </section>

      <ResponseScoringStatusPanel
        responseId={item.responseId}
        initialStatus={item.aiScoringStatus}
        initialError={item.aiScoringError}
        initialHasFinalVector={Boolean(item.finalVector)}
        initialHasDebugInterpretation={Boolean(item.debugInterpretation)}
      />

      {rescoreNotice?.rescore && rescoreNotice.message ? (
        <section className={`notice ${rescoreNotice.rescore === "ok" ? "ok" : "warn"}`} style={{ marginTop: "var(--space-4)" }}>
          {rescoreNotice.message}
        </section>
      ) : null}

      {!questionnaire || !scoring ? (
        <section className="notice warn" style={{ marginTop: "var(--space-4)" }}>
          无法加载结果：发布版本 SchemaSnapshot 格式发生损坏，或答卷数据存在错误，请核对。
        </section>
      ) : (
        <>
          {/* Respondent */}
          <section className="panel stack" style={{ marginTop: "var(--space-4)" }}>
            <div>
              <div className="kicker">[ 0x01_RESPONDENT_METADATA ]</div>
              <h2>{item.respondentName || "匿名测试者"}</h2>
              <p className="lead compact" style={{ fontSize: "var(--text-sm)" }}>
                关联归因成员：<strong>{item.memberName ?? "无（外部作答）"}</strong> · 
                作答时间：{item.createdAt.toLocaleString("zh-CN")} · 
                引用版本 ID：<code style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{item.versionId}</code>
              </p>
              {item.respondentNote ? (
                <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", background: "var(--color-surface-muted)", borderRadius: "6px", fontSize: "var(--text-sm)" }} className="preserve-lines">
                  <strong>附加备注：</strong>{item.respondentNote}
                </div>
              ) : null}
            </div>
          </section>

          {/* Final Vector */}
          <section className="panel stack">
            <div>
              <div className="kicker">[ 0x02_DIMENSIONAL_VECTORS ]</div>
              <h2>维度得分总览</h2>
              <p className="lead compact">
                显示各测定维度的原始积分。若该维度下范围可计算，则展示其归一化进度条。
              </p>
            </div>

            <div className="result-grid">
              {dimensionSummaries.map((dimension) => (
                <article className="result-card" key={dimension.id} style={{ borderLeft: "4px solid var(--color-primary)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <h3 style={{ fontSize: "var(--text-base)", margin: 0 }}>{dimension.name}</h3>
                    <code style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{dimension.id}</code>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
                    <strong className="score-number">{formatScore(dimension.raw)}</strong>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                      {dimension.min === null || dimension.max === null
                        ? "(范围无法推导)"
                        : `(区间: ${formatScore(dimension.min)} ~ ${formatScore(dimension.max)})`}
                    </span>
                  </div>

                  {renderProgressBar(dimension.normalized)}

                  <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted)" }}>
                    {dimension.description}
                  </p>
                  
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                    <span>归一化位置：</span>
                    <strong>{formatNormalized(dimension.normalized)}</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Top/Bottom */}
          <section className="result-columns">
            <div className="panel stack">
              <div>
                <div className="kicker">[ FEATURE.TOP_TENDENCY ]</div>
                <h2 style={{ fontSize: "var(--text-base)" }}>倾向最高的维度特征</h2>
              </div>
              {topDimensions.map((dimension) => (
                <div className="feature-line" key={dimension.id} style={{ borderLeft: "3px solid var(--color-ok)" }}>
                  <span>{dimension.name}</span>
                  <strong style={{ fontFamily: "var(--font-mono)", color: "var(--color-ok)" }}>+{formatScore(dimension.raw)}</strong>
                </div>
              ))}
            </div>

            <div className="panel stack">
              <div>
                <div className="kicker">[ FEATURE.BOTTOM_TENDENCY ]</div>
                <h2 style={{ fontSize: "var(--text-base)" }}>倾向最低的维度特征</h2>
              </div>
              {bottomDimensions.map((dimension) => (
                <div className="feature-line" key={dimension.id} style={{ borderLeft: "3px solid var(--color-danger)" }}>
                  <span>{dimension.name}</span>
                  <strong style={{ fontFamily: "var(--font-mono)", color: "var(--color-danger)" }}>{formatScore(dimension.raw)}</strong>
                </div>
              ))}
            </div>
          </section>

          {/* AI Debug Interpretation */}
          <section className="panel stack">
            <div>
              <div className="kicker">[ 0x03_COGNITIVE_INTERPRETATION ]</div>
              <h2>内部 debug 解读</h2>
              <p className="lead compact">
                由后台 AI 根据答卷结果向量及开放性回答综合生成的解读，仅供团队分析问卷灵敏度与方向。
              </p>
            </div>
            {item.debugInterpretation ? (
              <div className="debug-markdown">
                {renderMarkdownText(item.debugInterpretation)}
              </div>
            ) : (
              <div className="notice info">最终向量生成后，后台服务将自动开始生成 debug 解读。请稍候轮询。</div>
            )}
          </section>

          {/* Admin Operations */}
          <section className="panel stack" style={{ borderLeft: "4px solid var(--color-border-strong)" }}>
            <div>
              <div className="kicker">[ UTILITY.RECOMPUTE ]</div>
              <h2>重新评分与诊断</h2>
              <p className="lead compact" style={{ fontSize: "var(--text-sm)" }}>
                若 AI 计分遇到异常，或修改了问卷的评分 prompt，管理员可手动重新运行评分引擎与解读生成器。
              </p>
            </div>
            <form action={rescoreResponseAction} className="actions">
              <input name="responseId" type="hidden" value={item.responseId} />
              <button className="button" type="submit">
                重新进行评分与诊断
              </button>
            </form>
          </section>

          {/* Feedback Form */}
          <section className="panel stack">
            <div>
              <div className="kicker">[ 0x04_REPORT_FEEDBACK ]</div>
              <h2>答卷有效性及满意度反馈</h2>
              <p className="lead compact">
                测试者可提交 1~5 星的量化评价及文本备注，用于复盘测评的精细度。
              </p>
            </div>
            <FeedbackForm initialFeedback={existingFeedback ?? null} resultToken={item.resultToken} />
          </section>

          {/* Granular Contributions */}
          <section className="panel stack">
            <div>
              <div className="kicker">[ 0x05_GRANULAR_CONTRIBUTIONS ]</div>
              <h2>每道题目的计分贡献</h2>
            </div>

            <div className="answer-list">
              {scoring.perQuestionScores.map((questionScore, index) => (
                <article className="answer-question" key={questionScore.questionId} style={{ borderLeft: "3px solid var(--color-border)" }}>
                  <div className="question-heading">
                    <span className="badge subtle">Q{index + 1}</span>
                    <div>
                      <h3 style={{ fontSize: "var(--text-base)", margin: 0 }}>{questionScore.questionTitle}</h3>
                      <p className="muted-code" style={{ fontSize: "11px", marginTop: "2px" }}>
                        {questionScore.questionId} · {questionScore.questionType}
                      </p>
                    </div>
                  </div>

                  <dl className="meta-list compact-meta" style={{ marginTop: "var(--space-3)" }}>
                    <div>
                      <dt>测试者作答</dt>
                      <dd style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
                        {Array.isArray(questionScore.answer)
                          ? questionScore.answer.join(", ") || "(未选)"
                          : questionScore.answer || "(未填)"}
                      </dd>
                    </div>
                    <div>
                      <dt>维度影响向量</dt>
                      <dd>
                        <code style={{ fontSize: "11px", color: "var(--color-primary)" }}>{JSON.stringify(questionScore.deltaVector)}</code>
                      </dd>
                    </div>
                  </dl>

                  {questionScore.unknownOptionIds.length > 0 ? (
                    <div className="notice warn" style={{ marginTop: "var(--space-2)" }}>
                      警告：选项 ID [{questionScore.unknownOptionIds.join(", ")}] 未存在于当前 Schema 中，请检查数据完整性。
                    </div>
                  ) : null}

                  {questionScore.confidence !== undefined || questionScore.rationale ? (
                    <div className="notice info" style={{ marginTop: "var(--space-3)", borderLeft: "3px solid var(--color-primary)" }}>
                      {questionScore.confidence !== undefined ? (
                        <div style={{ marginBottom: "4px" }}>
                          AI 打分置信度：<strong style={{ fontFamily: "var(--font-mono)" }}>{questionScore.confidence}</strong>
                        </div>
                      ) : null}
                      {questionScore.rationale ? (
                        <p className="preserve-lines compact" style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted)" }}>
                          <strong>AI 判定理由：</strong>{questionScore.rationale}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
