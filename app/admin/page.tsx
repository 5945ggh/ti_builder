import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { createDb } from "@/lib/db/client";
import { members, questionnaireVersions, questionnaires, responses } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/session/admin-session";
import { MemberPicker } from "./member-picker";

const nextSteps = [
  {
    name: "发布版本",
    state: "已完成 M1-05",
    note: "发布版本使用当前选择成员写入 publishedByMemberId，并固化不可变 schemaSnapshot。",
  },
  {
    name: "内部作答",
    state: "已完成 M1-06",
    note: "内部作答使用当前选择成员作为 memberId 和 submitterKey，并通过 clientSubmissionId 保持幂等。",
  },
  {
    name: "结果向量",
    state: "已完成 M2-04",
    note: "Choice-only 作答会同步生成最终向量和每题贡献；开放题提交后由后台 worker 异步调用 AI 评分并生成 debug 解读。",
  },
  {
    name: "AI 连接",
    state: "已完成 M2-01",
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

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">Workbench</p>
          <h1>后台工作台</h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href="/admin/settings">
            系统设置
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="button ghost" type="submit">
              退出
            </button>
          </form>
        </div>
      </header>

      <section className="panel stack">
        <div>
          <div className="kicker">Member Attribution</div>
          <h2>选择当前操作者</h2>
          <p className="lead compact">
            成员身份可按名称自由添加并去重，只用于记录创建、修改、发布和内部作答归属；后台访问仍只由共享管理口令和服务端会话保护。
          </p>
        </div>

        {activeMembers.length > 0 ? (
          <>
            <MemberPicker members={activeMembers} selectedMemberId={selectedMember?.id} />
            <div className={selectedMember ? "notice ok" : "notice warn"}>
              {selectedMember ? (
                <>
                  当前归因成员：<strong>{selectedMember.name}</strong>
                </>
              ) : (
                "尚未选择成员。后续写入接口应要求先选择成员，以便记录归因。"
              )}
            </div>
          </>
        ) : (
          <div className="notice warn">数据库中没有成员。请先添加一个当前操作者，或运行 npm run db:seed 插入种子成员。</div>
        )}
      </section>

      <section className="panel stack">
        <div className="section-heading">
          <div>
            <div className="kicker">Questionnaires</div>
            <h2>问卷草稿</h2>
            <p className="lead compact">创建、编辑基础信息和当前 JSON 草稿；从编辑页发布不可变版本。</p>
          </div>
          <Link className="button" href="/admin/questionnaires/new">
            新建问卷
          </Link>
        </div>

        <div className="table compact-table" aria-label="最近问卷">
          <div className="row head">
            <span>标题</span>
            <span>场景</span>
            <span>更新时间</span>
            <span>版本/作答</span>
            <span>操作</span>
          </div>
          {questionnaireSummary.length > 0 ? (
            questionnaireSummary.map((item) => (
              <div className="row" key={item.id}>
                <span>{item.title}</span>
                <span>{item.scenario || "未设置"}</span>
                <span>{item.updatedAt.toLocaleString("zh-CN")}</span>
                <span>
                  {item.latestVersion > 0 ? `v${item.latestVersion}` : "未发布"} / {item.responseCount}
                </span>
                <span>
                  <Link className="text-link" href={`/admin/questionnaires/${item.id}`}>
                    编辑
                  </Link>
                </span>
              </div>
            ))
          ) : (
            <div className="row empty-row">
              <span>暂无问卷。</span>
            </div>
          )}
        </div>
        <div>
          <Link className="button secondary" href="/admin/questionnaires">
            查看全部问卷
          </Link>
        </div>
      </section>

      <section className="table" aria-label="后续任务归因约定">
        <div className="row head">
          <span>模块</span>
          <span>状态</span>
          <span>归因约定</span>
        </div>
        {nextSteps.map((item) => (
          <div className="row" key={item.name}>
            <span>{item.name}</span>
            <span>{item.state}</span>
            <span>{item.note}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
