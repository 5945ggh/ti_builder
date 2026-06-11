import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
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
          <p className="eyebrow">Internal Result</p>
          <h1>
            {item.questionnaireTitle} · v{item.versionNumber}
          </h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href={`/admin/questionnaires/${item.questionnaireId}`}>
            返回问卷
          </Link>
          <Link
            className="button secondary"
            href={`/admin/questionnaires/${item.questionnaireId}/versions/${item.versionId}/answer`}
          >
            继续作答
          </Link>
          <Link className="button" href={`/api/admin/responses/${item.responseId}/export`}>
            导出 JSON
          </Link>
        </div>
      </header>

      <section className="notice ok">
        Response ID: <code>{item.responseId}</code> · Result token: <code>{item.resultToken}</code>
      </section>

      <ResponseScoringStatusPanel
        responseId={item.responseId}
        initialStatus={item.aiScoringStatus}
        initialError={item.aiScoringError}
        initialHasFinalVector={Boolean(item.finalVector)}
        initialHasDebugInterpretation={Boolean(item.debugInterpretation)}
      />

      {rescoreNotice?.rescore && rescoreNotice.message ? (
        <section className={`notice ${rescoreNotice.rescore === "ok" ? "ok" : "warn"}`}>
          {rescoreNotice.message}
        </section>
      ) : null}

      {!questionnaire || !scoring ? (
        <section className="notice warn">发布版本 schemaSnapshot、答案或评分 JSON 无法解析，暂不能展示结果。</section>
      ) : (
        <>
          <section className="panel stack">
            <div>
              <div className="kicker">Respondent</div>
              <h2>{item.respondentName}</h2>
              <p className="lead compact">
                归因成员：{item.memberName ?? "未关联"} · 提交时间：{item.createdAt.toLocaleString("zh-CN")} ·
                作答绑定版本：{item.versionId}
              </p>
              {item.respondentNote ? <p className="preserve-lines">{item.respondentNote}</p> : null}
            </div>
          </section>

          <section className="panel stack">
            <div>
              <div className="kicker">Final Vector</div>
              <h2>最终维度向量</h2>
              <p className="lead compact">原始分始终展示；理论范围可推导时显示归一化位置。</p>
            </div>

            <div className="result-grid">
              {dimensionSummaries.map((dimension) => (
                <article className="result-card" key={dimension.id}>
                  <div>
                    <h3>{dimension.name}</h3>
                    <p className="muted-code">{dimension.id}</p>
                  </div>
                  <strong className="score-number">{formatScore(dimension.raw)}</strong>
                  <p className="muted">{dimension.description}</p>
                  <p className="muted-code">
                    范围：
                    {dimension.min === null || dimension.max === null
                      ? "无法推导"
                      : `${formatScore(dimension.min)} 至 ${formatScore(dimension.max)}`}
                    {" · "}
                    位置：{formatNormalized(dimension.normalized)}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="result-columns">
            <div className="panel stack">
              <div>
                <div className="kicker">Top</div>
                <h2>Top 特征</h2>
              </div>
              {topDimensions.map((dimension) => (
                <div className="feature-line" key={dimension.id}>
                  <span>{dimension.name}</span>
                  <strong>{formatScore(dimension.raw)}</strong>
                </div>
              ))}
            </div>

            <div className="panel stack">
              <div>
                <div className="kicker">Bottom</div>
                <h2>Bottom 特征</h2>
              </div>
              {bottomDimensions.map((dimension) => (
                <div className="feature-line" key={dimension.id}>
                  <span>{dimension.name}</span>
                  <strong>{formatScore(dimension.raw)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel stack">
            <div>
              <div className="kicker">Admin Action</div>
              <h2>重新评分这条作答</h2>
              <p className="lead compact">
                使用作答绑定的发布版本快照重跑所有开放题 AI 评分，重算最终向量，并重新生成 debug 解读。历史答案和 AI
                调用日志会保留。
              </p>
            </div>
            <form action={rescoreResponseAction} className="actions">
              <input name="responseId" type="hidden" value={item.responseId} />
              <button className="button" type="submit">
                重新评分
              </button>
            </form>
          </section>

          <section className="panel stack">
            <div>
              <div className="kicker">Feedback</div>
              <h2>结果反馈</h2>
              <p className="lead compact">
                反馈通过公开 result token API 写入；再次提交会按 responseId 更新同一条反馈。
              </p>
            </div>
            <FeedbackForm initialFeedback={existingFeedback ?? null} resultToken={item.resultToken} />
          </section>

          <section className="panel stack">
            <div>
              <div className="kicker">AI Debug Interpretation</div>
              <h2>内部 debug 解读</h2>
              <p className="lead compact">
                用于团队判断这套测评的解释性、稳定性和改进方向；不作为科学诊断或确定性升学/职业建议。
              </p>
            </div>
            {item.debugInterpretation ? (
              <p className="preserve-lines">{item.debugInterpretation}</p>
            ) : (
              <div className="notice info">最终向量可用后，后台 worker 会生成 debug 解读。</div>
            )}
          </section>

          <section className="panel stack">
            <div>
              <div className="kicker">Question Contributions</div>
              <h2>每题贡献</h2>
            </div>

            <div className="answer-list">
              {scoring.perQuestionScores.map((questionScore, index) => (
                <article className="answer-question" key={questionScore.questionId}>
                  <div className="question-heading">
                    <span className="badge subtle">Q{index + 1}</span>
                    <div>
                      <h3>{questionScore.questionTitle}</h3>
                      <p className="muted-code">
                        {questionScore.questionId} · {questionScore.questionType}
                      </p>
                    </div>
                  </div>

                  <dl className="meta-list compact-meta">
                    <div>
                      <dt>Answer</dt>
                      <dd>
                        {Array.isArray(questionScore.answer)
                          ? questionScore.answer.join(", ") || "未作答"
                          : questionScore.answer || "未作答"}
                      </dd>
                    </div>
                    <div>
                      <dt>Delta Vector</dt>
                      <dd>
                        <code className="muted-code">{JSON.stringify(questionScore.deltaVector)}</code>
                      </dd>
                    </div>
                  </dl>

                  {questionScore.unknownOptionIds.length > 0 ? (
                    <div className="notice warn">未知选项：{questionScore.unknownOptionIds.join(", ")}</div>
                  ) : null}

                  {questionScore.confidence !== undefined || questionScore.rationale ? (
                    <div className="notice info">
                      {questionScore.confidence !== undefined ? `AI confidence: ${questionScore.confidence}` : ""}
                      {questionScore.rationale ? (
                        <p className="preserve-lines compact">{questionScore.rationale}</p>
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
