import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSelectedAdminMember } from "@/lib/auth/admin";
import { createDb } from "@/lib/db/client";
import { members, questionnaireVersions, questionnaires } from "@/lib/db/schema";
import { parseQuestionnaireSchema } from "@/lib/schema/questionnaire";
import { InternalAnswerForm } from "./internal-answer-form";

type InternalAnswerPageProps = {
  params: Promise<{
    id: string;
    versionId: string;
  }>;
};

export default async function InternalAnswerPage({ params }: InternalAnswerPageProps) {
  const { id, versionId } = await params;
  const selectedMember = await getSelectedAdminMember();
  const item = createDb()
    .select({
      questionnaireId: questionnaires.id,
      questionnaireTitle: questionnaires.title,
      versionId: questionnaireVersions.id,
      versionNumber: questionnaireVersions.versionNumber,
      schemaSnapshot: questionnaireVersions.schemaSnapshot,
      publishedByName: members.name,
      publishedAt: questionnaireVersions.createdAt,
    })
    .from(questionnaireVersions)
    .innerJoin(questionnaires, eq(questionnaireVersions.questionnaireId, questionnaires.id))
    .leftJoin(members, eq(questionnaireVersions.publishedByMemberId, members.id))
    .where(and(eq(questionnaireVersions.id, versionId), eq(questionnaireVersions.questionnaireId, id)))
    .get();

  if (!item) {
    notFound();
  }

  let questionnaire;

  try {
    questionnaire = parseQuestionnaireSchema(JSON.parse(item.schemaSnapshot));
  } catch {
    questionnaire = null;
  }

  return (
    <main className="workspace wide">
      <header className="topbar">
        <div>
          <p className="eyebrow">Internal Answer</p>
          <h1>
            {item.questionnaireTitle} · v{item.versionNumber}
          </h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href={`/admin/questionnaires/${item.questionnaireId}`}>
            返回问卷
          </Link>
        </div>
      </header>

      <section className="notice ok">
        发布者：<strong>{item.publishedByName ?? "未知"}</strong> · 发布时间：
        {item.publishedAt.toLocaleString("zh-CN")} · 作答绑定版本：{item.versionId}
      </section>

      {!selectedMember ? (
        <section className="panel stack">
          <div className="notice warn">请先在后台首页选择当前操作者，再进行内部作答。</div>
          <div>
            <Link className="button secondary" href="/admin">
              选择操作者
            </Link>
          </div>
        </section>
      ) : null}

      {!questionnaire ? <section className="notice warn">发布版本 schemaSnapshot 无法解析，暂不能作答。</section> : null}

      {selectedMember && questionnaire ? (
        <InternalAnswerForm
          questionnaire={questionnaire}
          selectedMemberName={selectedMember.name}
          storageKey={`ti-answer:${item.versionId}:${selectedMember.id}`}
          versionId={item.versionId}
        />
      ) : null}
    </main>
  );
}
