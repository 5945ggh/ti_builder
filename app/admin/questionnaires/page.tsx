import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { getSelectedAdminMember } from "@/lib/auth/admin";
import { createDb } from "@/lib/db/client";
import { members, questionnaireVersions, questionnaires, responses } from "@/lib/db/schema";

export default async function QuestionnairesPage() {
  const db = createDb();
  const selectedMember = await getSelectedAdminMember();
  const items = db
    .select({
      id: questionnaires.id,
      title: questionnaires.title,
      description: questionnaires.description,
      scenario: questionnaires.scenario,
      internalNote: questionnaires.internalNote,
      createdByName: members.name,
      updatedAt: questionnaires.updatedAt,
      latestVersion: sql<number>`coalesce(max(${questionnaireVersions.versionNumber}), 0)`,
      responseCount: sql<number>`count(distinct ${responses.id})`,
    })
    .from(questionnaires)
    .leftJoin(members, eq(questionnaires.createdByMemberId, members.id))
    .leftJoin(questionnaireVersions, eq(questionnaireVersions.questionnaireId, questionnaires.id))
    .leftJoin(responses, eq(responses.questionnaireId, questionnaires.id))
    .groupBy(questionnaires.id, members.name)
    .orderBy(desc(questionnaires.updatedAt))
    .all();

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">Questionnaires</p>
          <h1>问卷管理</h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href="/admin">
            后台首页
          </Link>
          <Link className="button ghost" href="/admin/questionnaires/format-guide">
            格式说明
          </Link>
          <Link className="button" href="/admin/questionnaires/new">
            新建问卷
          </Link>
        </div>
      </header>

      {!selectedMember ? (
        <section className="notice warn">
          尚未选择当前操作者。可以浏览列表，但创建和保存草稿前需要先在后台首页选择成员。
        </section>
      ) : (
        <section className="notice ok">
          当前归因成员：<strong>{selectedMember.name}</strong>
        </section>
      )}

      <section className="table questionnaire-table" aria-label="问卷列表">
        <div className="row head">
          <span>标题</span>
          <span>场景</span>
          <span>创建者</span>
          <span>更新时间</span>
          <span>最新版本</span>
          <span>作答数</span>
          <span>操作</span>
        </div>
        {items.length > 0 ? (
          items.map((item) => (
            <div className="row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                {item.description ? <small>{item.description}</small> : null}
                {item.internalNote ? <small>内部备注：{item.internalNote}</small> : null}
              </span>
              <span>{item.scenario || "未设置"}</span>
              <span>{item.createdByName ?? "未知"}</span>
              <span>{item.updatedAt.toLocaleString("zh-CN")}</span>
              <span>{item.latestVersion > 0 ? `v${item.latestVersion}` : "未发布"}</span>
              <span>{item.responseCount}</span>
              <span>
                <Link className="text-link" href={`/admin/questionnaires/${item.id}`}>
                  编辑
                </Link>
              </span>
            </div>
          ))
        ) : (
          <div className="row empty-row">
            <span>暂无问卷。先创建一个草稿。</span>
          </div>
        )}
      </section>
    </main>
  );
}
