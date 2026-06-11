import Link from "next/link";
import { getSelectedAdminMember } from "@/lib/auth/admin";
import { QuestionnaireCreateForm } from "../questionnaire-create-form";

export default async function NewQuestionnairePage() {
  const selectedMember = await getSelectedAdminMember();

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">Questionnaires</p>
          <h1>新建问卷</h1>
        </div>
        <Link className="button ghost" href="/admin/questionnaires">
          返回列表
        </Link>
        <Link className="button ghost" href="/admin/questionnaires/format-guide">
          格式说明
        </Link>
      </header>

      {!selectedMember ? (
        <section className="panel stack">
          <div className="notice warn">请先在后台首页选择当前操作者，再创建问卷。</div>
          <div>
            <Link className="button secondary" href="/admin">
              选择操作者
            </Link>
          </div>
        </section>
      ) : (
        <section className="panel stack">
          <div>
            <div className="kicker">Created by {selectedMember.name}</div>
            <h2>基础信息</h2>
            <p className="lead compact">
              创建后会自动生成一个可通过 M1-03 校验的最小 JSON 草稿。内部备注只用于后台管理，不进入发布版本。
            </p>
          </div>
          <QuestionnaireCreateForm />
        </section>
      )}
    </main>
  );
}
