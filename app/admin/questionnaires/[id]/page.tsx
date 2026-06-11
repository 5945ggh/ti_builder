import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createDb } from "@/lib/db/client";
import { members, questionnaireVersions, questionnaires } from "@/lib/db/schema";
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
  const validation = validateQuestionnaireDraftText(item.currentDraftSchema);

  return (
    <main className="workspace wide">
      <header className="topbar">
        <div>
          <p className="eyebrow">Questionnaire Draft</p>
          <h1>{item.title}</h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href="/admin/questionnaires">
            返回列表
          </Link>
        </div>
      </header>

      <section className="notice ok">
        创建者：<strong>{item.createdByName ?? "未知"}</strong> · 创建：{item.createdAt.toLocaleString("zh-CN")} · 更新：
        {item.updatedAt.toLocaleString("zh-CN")}
      </section>

      <div className="editor-layout">
        <QuestionnaireEditorForm questionnaire={item} initialValidation={validation.ok ? null : validation.error} />
      </div>

      <div className="publish-layout">
        <QuestionnairePublishPanel questionnaireId={item.id} versions={versions} />
      </div>
    </main>
  );
}
