"use client";

import { useActionState } from "react";
import Link from "next/link";
import { publishQuestionnaireAction, type PublishQuestionnaireFormState } from "./actions";

export type QuestionnaireVersionListItem = {
  id: string;
  versionNumber: number;
  publishNote: string;
  publishedByName: string | null;
  publishedByMemberId: string;
  createdAt: Date;
  testToken: string;
  testTokenMaxResponses: number;
  testTokenResponseCount: number;
  testTokenDisabledAt: Date | null;
};

type QuestionnairePublishPanelProps = {
  questionnaireId: string;
  versions: QuestionnaireVersionListItem[];
};

const initialState: PublishQuestionnaireFormState = {};

export function QuestionnairePublishPanel({ questionnaireId, versions }: QuestionnairePublishPanelProps) {
  const [state, formAction, isPending] = useActionState(publishQuestionnaireAction, initialState);

  return (
    <section className="panel stack">
      <div>
        <div className="kicker">Publish</div>
        <h2>发布不可变版本</h2>
        <p className="lead compact">
          发布会校验当前已保存草稿，生成新的版本号、完整 JSON 快照和测试 token。后续编辑草稿不会修改已发布版本。
        </p>
      </div>

      <form action={formAction} className="form">
        <input name="questionnaireId" type="hidden" value={questionnaireId} />

        <label className="field">
          <span>版本备注</span>
          <textarea
            maxLength={2000}
            name="publishNote"
            placeholder="例如：重写第 3 题，降低艺术维度权重"
            required
            rows={3}
          />
        </label>

        {state.error ? <pre className="form-error">{state.error}</pre> : null}

        <div className="actions split-actions">
          <button className="button" disabled={isPending} type="submit">
            {isPending ? "发布中..." : "发布版本"}
          </button>
          <span className="inline-status">只发布数据库中已保存的当前草稿。</span>
        </div>
      </form>

      <div className="version-list" aria-label="已发布版本">
        <div className="section-heading">
          <div>
            <h2>版本历史</h2>
            <p className="lead compact">显示版本号、备注、发布者、发布时间和测试 token 状态。</p>
          </div>
        </div>

        {versions.length > 0 ? (
          <div className="table version-table">
            <div className="row head">
              <span>版本</span>
              <span>发布者</span>
              <span>发布时间</span>
              <span>测试 token / 状态</span>
              <span>备注</span>
            </div>
            {versions.map((version) => (
              <div className="row" key={version.id}>
                <span>
                  <strong>v{version.versionNumber}</strong>
                </span>
                <span>
                  {version.publishedByName ?? "未知"}
                  <small>{version.publishedByMemberId}</small>
                </span>
                <span>{version.createdAt.toLocaleString("zh-CN")}</span>
                <span>
                  <code className="muted-code">{version.testToken}</code>
                  <small>
                    {version.testTokenDisabledAt
                      ? `已禁用：${version.testTokenDisabledAt.toLocaleString("zh-CN")}`
                      : `启用中：${version.testTokenResponseCount}/${version.testTokenMaxResponses}`}
                  </small>
                  <small>
                    <Link
                      className="text-link"
                      href={`/admin/questionnaires/${questionnaireId}/versions/${version.id}/answer`}
                    >
                      内部作答
                    </Link>
                  </small>
                </span>
                <span className="preserve-lines">{version.publishNote || "无备注"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="notice warn">尚未发布版本。</div>
        )}
      </div>
    </section>
  );
}
