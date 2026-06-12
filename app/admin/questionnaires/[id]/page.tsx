import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createDb } from "@/lib/db/client";
import { members, questionnaireVersions, questionnaires, responses } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { validateQuestionnaireDraftText } from "@/lib/questionnaires/draft";
import { QuestionnaireEditorForm } from "../questionnaire-editor-form";
import { QuestionnairePublishPanel } from "../questionnaire-publish-panel";

type EditQuestionnairePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditQuestionnairePage({ params }: EditQuestionnairePageProps) {
  const { id } = await params;
  const schemaSourceMaxChars = getServerEnv().AI_SCHEMA_SOURCE_MAX_CHARS;
  const db = createDb();
  const item = db
    .select({
      id: questionnaires.id,
      title: questionnaires.title,
      description: questionnaires.description,
      scenario: questionnaires.scenario,
      internalNote: questionnaires.internalNote,
      createdByName: members.name,
      createdAt: questionnaires.createdAt,
      updatedAt: questionnaires.updatedAt,
      currentDraftSchema: questionnaires.currentDraftSchema,
    })
    .from(questionnaires)
    .leftJoin(members, eq(questionnaires.createdByMemberId, members.id))
    .where(eq(questionnaires.id, id))
    .get();

  if (!item) {
    notFound();
  }

  const versions = db
    .select({
      id: questionnaireVersions.id,
      versionNumber: questionnaireVersions.versionNumber,
      publishNote: questionnaireVersions.publishNote,
      publishedByName: members.name,
      publishedByMemberId: questionnaireVersions.publishedByMemberId,
      createdAt: questionnaireVersions.createdAt,
      testToken: questionnaireVersions.testToken,
      testTokenMaxResponses: questionnaireVersions.testTokenMaxResponses,
      testTokenResponseCount: questionnaireVersions.testTokenResponseCount,
      testTokenDisabledAt: questionnaireVersions.testTokenDisabledAt,
    })
    .from(questionnaireVersions)
    .leftJoin(members, eq(questionnaireVersions.publishedByMemberId, members.id))
    .where(eq(questionnaireVersions.questionnaireId, id))
    .orderBy(desc(questionnaireVersions.versionNumber))
    .all();
  const internalResponses = db
    .select({
      responseId: responses.id,
      respondentName: responses.respondentName,
      createdAt: responses.createdAt,
      aiScoringStatus: responses.aiScoringStatus,
      versionNumber: questionnaireVersions.versionNumber,
      memberName: members.name,
    })
    .from(responses)
    .innerJoin(questionnaireVersions, eq(responses.versionId, questionnaireVersions.id))
    .leftJoin(members, eq(responses.memberId, members.id))
    .where(and(eq(responses.questionnaireId, id), eq(responses.source, "internal_member")))
    .orderBy(desc(responses.createdAt))
    .limit(20)
    .all();
  const validation = validateQuestionnaireDraftText(item.currentDraftSchema);

  return (
    <main className="workspace wide">
      <header className="topbar">
        <div>
          <p className="eyebrow">[ CONFIGURATION_CONSOLE ]</p>
          <h1 style={{ fontSize: "var(--text-xl)" }}>{item.title}</h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href="/admin/questionnaires/format-guide">
            JSON 格式指南
          </Link>
          <Link className="button ghost" href="/admin/questionnaires">
            返回列表
          </Link>
        </div>
      </header>

      <section className="notice ok" style={{ marginBottom: "var(--space-6)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "space-between" }}>
        <span>
          创建成员：<strong>{item.createdByName ?? "未知"}</strong>
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
          [CREATED_AT] {item.createdAt.toLocaleString("zh-CN")} · [LAST_MODIFIED] {item.updatedAt.toLocaleString("zh-CN")}
        </span>
      </section>

      <div className="editor-layout">
        <QuestionnaireEditorForm
          questionnaire={item}
          initialValidation={validation.ok ? null : validation.error}
          schemaSourceMaxChars={schemaSourceMaxChars}
        />
      </div>

      <div className="publish-layout">
        <QuestionnairePublishPanel questionnaireId={item.id} versions={versions} />
      </div>

      <section className="panel stack" style={{ marginTop: "var(--space-6)" }}>
        <div className="section-heading">
          <div>
            <div className="kicker">[ INTERNAL_RESPONSE_LOG ]</div>
            <h2 style={{ fontSize: "var(--text-lg)" }}>内部作答记录</h2>
            <p className="lead compact">
              当前问卷下最近 20 条内部成员作答，可进入结果详情查看向量、原始答案和 AI 评分状态。
            </p>
          </div>
        </div>

        <div className="table response-table" aria-label="当前问卷内部作答记录">
          <div className="row head">
            <span>作答 ID</span>
            <span>版本</span>
            <span>作答人 / 成员</span>
            <span>作答时间</span>
            <span>AI 状态</span>
            <span>详情</span>
          </div>
          {internalResponses.length > 0 ? (
            internalResponses.map((response) => (
              <div className="row" key={response.responseId}>
                <span>
                  <code className="muted-code">{response.responseId}</code>
                </span>
                <span style={{ fontFamily: "var(--font-mono)" }}>v{response.versionNumber}</span>
                <span>
                  {response.respondentName || "未命名作答人"}
                  <small>{response.memberName ? `成员：${response.memberName}` : "成员：未关联"}</small>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                  {response.createdAt.toLocaleString("zh-CN")}
                </span>
                <span>
                  <span className="badge subtle">{response.aiScoringStatus}</span>
                </span>
                <span>
                  <Link className="text-link" href={`/admin/responses/${response.responseId}`}>
                    查看 →
                  </Link>
                </span>
              </div>
            ))
          ) : (
            <div className="row empty-row">
              <span>当前问卷暂无内部作答记录。发布版本后可从版本历史中的“内部作答”入口提交。</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
