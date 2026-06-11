"use client";

import { useActionState } from "react";
import { createQuestionnaireAction, type QuestionnaireFormState } from "./actions";

const initialState: QuestionnaireFormState = {};

export function QuestionnaireCreateForm() {
  const [state, formAction, isPending] = useActionState(createQuestionnaireAction, initialState);

  return (
    <form action={formAction} className="form">
      <label className="field">
        <span>标题</span>
        <input maxLength={160} name="title" required />
      </label>

      <label className="field">
        <span>简短说明</span>
        <textarea name="description" rows={4} />
      </label>

      <label className="field">
        <span>目标场景</span>
        <input maxLength={240} name="scenario" placeholder="高考专业选择 / 天赋探索 / 人格标签 / 混合型" />
      </label>

      <label className="field">
        <span>内部备注</span>
        <textarea
          maxLength={4000}
          name="internalNote"
          placeholder="只用于后台管理，不会进入发布版本或作答结果。"
          rows={3}
        />
      </label>

      {state.error ? <pre className="form-error">{state.error}</pre> : null}

      <div className="actions">
        <button className="button" disabled={isPending} type="submit">
          {isPending ? "创建中..." : "创建问卷"}
        </button>
      </div>
    </form>
  );
}
