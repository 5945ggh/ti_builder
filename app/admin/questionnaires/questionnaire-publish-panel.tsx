"use client";

import { useActionState } from "react";
import type { MouseEvent } from "react";
import { useState } from "react";
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

function truncateToken(token: string) {
  return token.length > 6 ? `${token.slice(0, 6)}...` : token;
}

export function QuestionnairePublishPanel({ questionnaireId, versions }: QuestionnairePublishPanelProps) {
  const [state, formAction, isPending] = useActionState(publishQuestionnaireAction, initialState);
  const [copyState, setCopyState] = useState<Record<string, "copied" | "failed">>({});

  const handlePublishClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm("发布后会生成不可变版本，后续编辑草稿不会修改这个版本。确认发布？")) {
      event.preventDefault();
    }
  };

  const handleCopyToken = async (versionId: string, token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopyState((current) => ({ ...current, [versionId]: "copied" }));
    } catch {
      setCopyState((current) => ({ ...current, [versionId]: "failed" }));
    }

    window.setTimeout(() => {
      setCopyState((current) => {
        const rest = { ...current };
        delete rest[versionId];
        return rest;
      });
    }, 2000);
  };

  return (
    <details className="panel disclosure-panel">
      <summary>
        <div>
          <div className="kicker">发布与版本</div>
          <h2>发布不可变版本</h2>
          <p className="lead compact">
            发布会校验当前已保存草稿，生成版本号、完整 JSON 快照和测试 token。
          </p>
        </div>
      </summary>

      <div className="disclosure-body stack">
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
            <button className="button danger" disabled={isPending} onClick={handlePublishClick} type="submit">
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
                  <span>{version.publishedByName ?? "未知"}</span>
                  <span>{version.createdAt.toLocaleString("zh-CN")}</span>
                  <span>
                    <span className="token-cell">
                      <code className="muted-code" aria-label="已截断的测试 token">
                        {truncateToken(version.testToken)}
                      </code>
                      <button
                        className="icon-button"
                        onClick={() => void handleCopyToken(version.id, version.testToken)}
                        title="复制完整 token"
                        type="button"
                      >
                        {copyState[version.id] === "copied"
                          ? "已复制"
                          : copyState[version.id] === "failed"
                            ? "复制失败"
                            : "复制"}
                      </button>
                    </span>
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
                  <span className="note-text" title={version.publishNote || "无备注"}>
                    {version.publishNote || "无备注"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="notice warn">尚未发布版本。</div>
          )}
        </div>
      </div>
    </details>
  );
}
