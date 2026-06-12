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
  const latestVersions = db
    .select({
      questionnaireId: questionnaireVersions.questionnaireId,
      versionId: questionnaireVersions.id,
      versionNumber: questionnaireVersions.versionNumber,
    })
    .from(questionnaireVersions)
    .orderBy(desc(questionnaireVersions.versionNumber))
    .all();
  const latestVersionByQuestionnaireId = new Map<
    string,
    { versionId: string; versionNumber: number }
  >();

  for (const version of latestVersions) {
    if (!latestVersionByQuestionnaireId.has(version.questionnaireId)) {
      latestVersionByQuestionnaireId.set(version.questionnaireId, {
        versionId: version.versionId,
        versionNumber: version.versionNumber,
      });
    }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">[ DATABASE_REGISTERS ]</p>
          <h1>问卷管理</h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href="/admin">
            返回首页
          </Link>
          <Link className="button ghost" href="/admin/questionnaires/format-guide">
            JSON 格式指南
          </Link>
          <Link className="button" href="/admin/questionnaires/new">
            新建问卷草稿
          </Link>
        </div>
      </header>

      {!selectedMember ? (
        <section className="notice warn" style={{ marginBottom: "var(--space-4)" }}>
          [警告] 尚未选择当前操作者。您可以浏览现有问卷，但在执行“新建问卷”或“保存修改”前，请先返回主页选择或新增成员。
        </section>
      ) : (
        <section className="notice ok" style={{ marginBottom: "var(--space-4)" }}>
          当前归因成员：<strong>{selectedMember.name}</strong> ({selectedMember.role})
        </section>
      )}

      <section className="table questionnaire-table" aria-label="问卷列表">
        <div className="row head">
          <span>问卷标题 / 备注</span>
          <span>场景标识</span>
          <span>创建者</span>
          <span>更新时间</span>
          <span>版本状态</span>
          <span>已收作答</span>
          <span>管理操作</span>
        </div>
        {items.length > 0 ? (
          items.map((item) => {
            const latestVersion = latestVersionByQuestionnaireId.get(item.id);

            return (
              <div className="row" key={item.id}>
                <span>
                  <strong style={{ fontSize: "var(--text-base)", color: "var(--color-primary)" }}>
                    {item.title}
                  </strong>
                  {item.description ? (
                    <small style={{ marginTop: "2px", display: "block" }}>{item.description}</small>
                  ) : null}
                  {item.internalNote ? (
                    <small style={{ marginTop: "4px", color: "var(--color-accent)", display: "block", fontStyle: "italic" }}>
                      内部备注：{item.internalNote}
                    </small>
                  ) : null}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                  {item.scenario || "DEFAULT"}
                </span>
                <span>{item.createdByName ?? "未知"}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                  {item.updatedAt.toLocaleDateString("zh-CN") + " " + item.updatedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {latestVersion ? (
                    <span className="badge" style={{ border: "1px solid var(--color-primary)", background: "var(--color-primary-soft)" }}>
                      v{latestVersion.versionNumber}
                    </span>
                  ) : (
                    <span className="badge subtle">DRAFT</span>
                  )}
                </span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{item.responseCount} 份</span>
                <span className="table-actions">
                  {latestVersion ? (
                    <Link
                      className="text-link"
                      href={`/admin/questionnaires/${item.id}/versions/${latestVersion.versionId}/answer`}
                    >
                      内部作答
                    </Link>
                  ) : null}
                  <Link className="text-link" href={`/admin/questionnaires/${item.id}`} style={{ fontWeight: "700" }}>
                    配置与发布
                  </Link>
                </span>
              </div>
            );
          })
        ) : (
          <div className="row empty-row">
            <span>暂无问卷记录。请先点击右上角“新建问卷草稿”开启生产。</span>
          </div>
        )}
      </section>
    </main>
  );
}
