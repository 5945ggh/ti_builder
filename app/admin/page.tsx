import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { createDb } from "@/lib/db/client";
import { members, questionnaireVersions, questionnaires, responses } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/session/admin-session";
import { MemberPicker } from "./member-picker";

const nextSteps = [
  {
    name: "发布版本",
    state: "M1-05 READY",
    note: "发布版本使用当前选择成员写入 publishedByMemberId，并固化不可变 schemaSnapshot。",
  },
  {
    name: "内部作答",
    state: "M1-06 READY",
    note: "内部作答使用当前选择成员作为 memberId 和 submitterKey，并通过 clientSubmissionId 保持幂等。",
  },
  {
    name: "结果向量",
    state: "M2-04 READY",
    note: "Choice-only 作答会同步生成最终向量；开放题由后台 worker 异步调用 AI 评分并生成 debug 解读。",
  },
  {
    name: "AI 连接",
    state: "M2-01 READY",
    note: "系统设置页可运行服务端 AI 连接自测，API key 不会进入浏览器响应。",
  },
];

export default async function AdminPage() {
  const session = await getAdminSession();
  const db = createDb();
  const activeMembers = db
    .select({
      id: members.id,
      name: members.name,
      role: members.role,
    })
    .from(members)
    .where(isNull(members.archivedAt))
    .orderBy(asc(members.name))
    .all();
  const selectedMember = activeMembers.find((member) => member.id === session?.selectedMemberId);
  const questionnaireSummary = db
    .select({
      id: questionnaires.id,
      title: questionnaires.title,
      scenario: questionnaires.scenario,
      updatedAt: questionnaires.updatedAt,
      latestVersion: sql<number>`coalesce(max(${questionnaireVersions.versionNumber}), 0)`,
      responseCount: sql<number>`count(distinct ${responses.id})`,
    })
    .from(questionnaires)
    .leftJoin(questionnaireVersions, eq(questionnaireVersions.questionnaireId, questionnaires.id))
    .leftJoin(responses, eq(responses.questionnaireId, questionnaires.id))
    .groupBy(questionnaires.id)
    .orderBy(desc(questionnaires.updatedAt))
    .limit(5)
    .all();
  const recentInternalResponses = db
    .select({
      responseId: responses.id,
      respondentName: responses.respondentName,
      createdAt: responses.createdAt,
      aiScoringStatus: responses.aiScoringStatus,
      questionnaireId: questionnaires.id,
      questionnaireTitle: questionnaires.title,
      versionNumber: questionnaireVersions.versionNumber,
      memberName: members.name,
    })
    .from(responses)
    .innerJoin(questionnaires, eq(responses.questionnaireId, questionnaires.id))
    .innerJoin(questionnaireVersions, eq(responses.versionId, questionnaireVersions.id))
    .leftJoin(members, eq(responses.memberId, members.id))
    .where(eq(responses.source, "internal_member"))
    .orderBy(desc(responses.createdAt))
    .limit(8)
    .all();

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">[ SYSTEM_CONTROL_PANEL ]</p>
          <h1>后台工作台</h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href="/admin/settings">
            系统设置
          </Link>
          <form action="/api/auth/logout" method="post" style={{ display: "inline" }}>
            <button className="button ghost" type="submit">
              退出控制台
            </button>
          </form>
        </div>
      </header>

      {/* Operator Section */}
      <section className="panel stack">
        <div>
          <div className="kicker">[ 0x01_ATTRIBUTION_IDENTITY ]</div>
          <h2 style={{ fontSize: "var(--text-lg)" }}>选择当前操作者</h2>
          <p className="lead compact">
            成员身份用于记录问卷创建、更新、发布及内部作答归因，可按名称自由添加。
          </p>
        </div>

        {activeMembers.length > 0 ? (
          <>
            <MemberPicker members={activeMembers} selectedMemberId={selectedMember?.id} />
            <div className={selectedMember ? "notice ok" : "notice warn"}>
              {selectedMember ? (
                <>
                  当前操作者归因：<strong>{selectedMember.name}</strong> ({selectedMember.role})
                </>
              ) : (
                "尚未选择操作成员。后续写操作需要指定成员，请从上表选择或新增成员。"
              )}
            </div>
          </>
        ) : (
          <div className="notice warn">
            数据库中无成员记录。请在上方输入姓名添加操作者，或运行 <code>npm run db:seed</code> 写入种子数据。
          </div>
        )}
      </section>

      {/* Questionnaire List */}
      <section className="panel stack">
        <div className="section-heading">
          <div>
            <div className="kicker">[ 0x02_QUESTIONNAIRES_DRAFT ]</div>
            <h2 style={{ fontSize: "var(--text-lg)" }}>问卷草稿与版本</h2>
            <p className="lead compact">进行问卷基础字段和 JSON Schema 草稿配置，或将当前草稿发布为正式版。</p>
          </div>
          <Link className="button" href="/admin/questionnaires/new">
            新建问卷草稿
          </Link>
        </div>

        <div className="table compact-table" aria-label="最近编辑问卷">
          <div className="row head">
            <span>标题</span>
            <span>核心场景</span>
            <span>更新时间</span>
            <span>最新版本 / 作答</span>
            <span>管理</span>
          </div>
          {questionnaireSummary.length > 0 ? (
            questionnaireSummary.map((item) => (
              <div className="row" key={item.id}>
                <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{item.title}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                  {item.scenario || "DEFAULT"}
                </span>
                <span>{item.updatedAt.toLocaleString("zh-CN")}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {item.latestVersion > 0 ? `v${item.latestVersion}` : "草稿状态"} ({item.responseCount} 份)
                </span>
                <span>
                  <Link className="text-link" href={`/admin/questionnaires/${item.id}`}>
                    进入编辑 →
                  </Link>
                </span>
              </div>
            ))
          ) : (
            <div className="row empty-row">
              <span>暂无问卷记录。请先点击右上角“新建问卷草稿”。</span>
            </div>
          )}
        </div>
        
        <div>
          <Link className="button secondary" href="/admin/questionnaires">
            查看完整问卷列表
          </Link>
        </div>
      </section>

      {/* Internal Responses */}
      <section className="panel stack">
        <div className="section-heading">
          <div>
            <div className="kicker">[ 0x03_INTERNAL_RESPONSES ]</div>
            <h2 style={{ fontSize: "var(--text-lg)" }}>最近内部作答</h2>
            <p className="lead compact">
              查看内部成员提交的作答记录、评分状态，并进入现有作答详情页。
            </p>
          </div>
          <Link className="button secondary" href="/admin/questionnaires">
            按问卷查看
          </Link>
        </div>

        <div className="table response-table" aria-label="最近内部作答">
          <div className="row head">
            <span>问卷</span>
            <span>版本</span>
            <span>作答人 / 成员</span>
            <span>作答时间</span>
            <span>AI 状态</span>
            <span>详情</span>
          </div>
          {recentInternalResponses.length > 0 ? (
            recentInternalResponses.map((response) => (
              <div className="row" key={response.responseId}>
                <span>
                  <strong style={{ color: "var(--color-primary)" }}>{response.questionnaireTitle}</strong>
                  <small>{response.questionnaireId}</small>
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
              <span>暂无内部作答记录。可从已发布版本的“内部作答”入口提交测试。</span>
            </div>
          )}
        </div>
      </section>

      {/* Task Registers */}
      <div className="kicker">[ 0x04_SYSTEM_ARCHITECTURE ]</div>
      <section className="table" aria-label="后续任务归因约定" style={{ marginBottom: "var(--space-8)" }}>
        <div className="row head" style={{ gridTemplateColumns: "180px 140px minmax(0, 1fr)" }}>
          <span>系统模块</span>
          <span>状态代码</span>
          <span>实现机制与数据隔离</span>
        </div>
        {nextSteps.map((item) => (
          <div className="row" key={item.name} style={{ gridTemplateColumns: "180px 140px minmax(0, 1fr)" }}>
            <span style={{ fontWeight: 600 }}>{item.name}</span>
            <span className="badge" style={{ alignSelf: "center", border: "1px solid var(--color-border-strong)", background: "var(--color-surface-muted)", color: "var(--color-text)" }}>
              {item.state}
            </span>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{item.note}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
