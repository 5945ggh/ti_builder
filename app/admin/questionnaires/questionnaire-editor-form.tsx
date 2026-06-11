"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { QuestionnairePreview } from "@/components/questionnaire/questionnaire-preview";
import { validateQuestionnaireDraftText } from "@/lib/questionnaires/draft";
import {
  confirmGeneratedDraftAction,
  generateSchemaDraftAction,
  updateQuestionnaireAction,
  type ConfirmGeneratedDraftFormState,
  type GenerateSchemaDraftFormState,
  type QuestionnaireFormState,
} from "./actions";

type QuestionnaireEditorFormProps = {
  questionnaire: {
    id: string;
    title: string;
    description: string;
    scenario: string;
    internalNote: string;
    currentDraftSchema: string;
  };
  initialValidation: string | null;
};

const initialState: QuestionnaireFormState = {};
const initialGenerateState: GenerateSchemaDraftFormState = { status: "idle" };
const initialConfirmState: ConfirmGeneratedDraftFormState = {};

const generationModes = [
  ["document_to_schema", "从文档整理为 schema"],
  ["rewrite_questions", "改写现有题目"],
  ["dimension_definitions", "生成维度定义"],
  ["scoring_vectors", "生成选项评分向量建议"],
  ["open_scoring_prompts", "生成开放题评分 prompt"],
] as const;

export function QuestionnaireEditorForm({ questionnaire, initialValidation }: QuestionnaireEditorFormProps) {
  const [state, formAction, isPending] = useActionState(updateQuestionnaireAction, initialState);
  const [generateState, generateAction, isGenerating] = useActionState(generateSchemaDraftAction, initialGenerateState);
  const [confirmState, confirmAction, isConfirming] = useActionState(
    confirmGeneratedDraftAction,
    initialConfirmState,
  );
  const [schemaText, setSchemaText] = useState(questionnaire.currentDraftSchema);
  const [generatedDraftText, setGeneratedDraftText] = useState("");
  const [title, setTitle] = useState(questionnaire.title);
  const [description, setDescription] = useState(questionnaire.description);
  const [scenario, setScenario] = useState(questionnaire.scenario);
  const [internalNote, setInternalNote] = useState(questionnaire.internalNote);
  const clientValidation = useMemo(() => validateQuestionnaireDraftText(schemaText), [schemaText]);
  const validationError = clientValidation.ok ? null : clientValidation.error;
  const generatedValidation = useMemo(
    () => (generatedDraftText ? validateQuestionnaireDraftText(generatedDraftText) : null),
    [generatedDraftText],
  );

  useEffect(() => {
    if (generateState.status === "valid") {
      setGeneratedDraftText(generateState.draftText);
    }
  }, [generateState]);

  useEffect(() => {
    if (confirmState.saved && confirmState.draftText) {
      setSchemaText(confirmState.draftText);
      setGeneratedDraftText("");

      const confirmedValidation = validateQuestionnaireDraftText(confirmState.draftText);

      if (confirmedValidation.ok) {
        setTitle(confirmedValidation.questionnaire.title);
        setDescription(confirmedValidation.questionnaire.description);
        setScenario(confirmedValidation.questionnaire.scenario);
      }
    }
  }, [confirmState]);

  return (
    <>
      <section className="panel stack">
        <div>
          <div className="kicker">AI Draft Generation</div>
          <h2>AI 生成 schema 草稿</h2>
          <p className="lead compact">
            生成结果只会显示在本页，不会自动发布，也不会自动覆盖当前草稿。确认写入时会再次执行 zod 校验。
          </p>
        </div>

        <form action={generateAction} className="form">
          <input name="questionnaireId" type="hidden" value={questionnaire.id} />
          <input name="existingDraftSchema" type="hidden" value={schemaText} />

          <label className="field">
            <span>生成模式</span>
            <select defaultValue="document_to_schema" name="mode">
              {generationModes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>来源文本</span>
            <textarea
              maxLength={20_000}
              minLength={20}
              name="sourceText"
              placeholder="粘贴题目构思、文档内容、维度说明或需要改写的问卷文本。"
              required
              rows={8}
            />
          </label>

          {"error" in generateState && generateState.error ? (
            <pre className="form-error">{generateState.error}</pre>
          ) : null}

          <div className="actions split-actions">
            <button className="button" disabled={isGenerating} type="submit">
              {isGenerating ? "生成中..." : "生成草稿"}
            </button>
            <span className="inline-status">AI 调用会以 schema_draft_generation 写入调用日志。</span>
          </div>
        </form>

        {generateState.status === "invalid" ? (
          <div className="notice warn preserve-lines">
            <strong>AI 输出未通过校验。</strong>
            {"\n"}
            {generateState.error}
            {"\n\n"}
            <strong>原始输出 / 安全摘录：</strong>
            {"\n"}
            {generateState.rawOutput ?? "AI 请求未返回可展示的原始输出。"}
          </div>
        ) : null}

        {generatedDraftText ? (
          <div className="generated-draft stack">
            <div className={generatedValidation?.ok ? "notice ok" : "notice warn preserve-lines"}>
              {generatedValidation?.ok
                ? "生成草稿已通过本地校验。点击确认后才会写入 currentDraftSchema。"
                : `生成草稿当前未通过校验：\n${generatedValidation?.error ?? ""}`}
            </div>

            <label className="field">
              <span>生成草稿 JSON</span>
              <textarea
                className="code-editor generated-code-editor"
                onChange={(event) => setGeneratedDraftText(event.target.value)}
                spellCheck={false}
                value={generatedDraftText}
              />
            </label>

            {generateState.status === "valid" ? (
              <dl className="meta-list compact-meta">
                <div>
                  <dt>Model</dt>
                  <dd>{generateState.model}</dd>
                </div>
                <div>
                  <dt>Latency</dt>
                  <dd>{generateState.latencyMs} ms</dd>
                </div>
                <div>
                  <dt>Attempts</dt>
                  <dd>{generateState.attempts}</dd>
                </div>
              </dl>
            ) : null}

            {confirmState.error ? <pre className="form-error">{confirmState.error}</pre> : null}
            {confirmState.saved ? <div className="notice ok">生成草稿已确认写入，并同步到下方编辑器。</div> : null}

            <form action={confirmAction} className="actions split-actions">
              <input name="questionnaireId" type="hidden" value={questionnaire.id} />
              <input name="generatedDraftText" type="hidden" value={generatedDraftText} />
              <button className="button" disabled={isConfirming || !generatedValidation?.ok} type="submit">
                {isConfirming ? "写入中..." : "确认写入当前草稿"}
              </button>
              <button className="button ghost" onClick={() => setGeneratedDraftText("")} type="button">
                放弃生成结果
              </button>
            </form>
          </div>
        ) : null}
      </section>

      <section className="panel stack">
        <div>
          <div className="kicker">Draft Editor</div>
          <h2>基础信息与 JSON Schema</h2>
          <p className="lead compact">保存前会重新解析 JSON 并执行 M1-03 zod schema 校验。无效草稿不会写入数据库。</p>
        </div>

        <form action={formAction} className="form">
          <input name="questionnaireId" type="hidden" value={questionnaire.id} />

          <label className="field">
            <span>标题</span>
            <input
              maxLength={160}
              name="title"
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>

          <label className="field">
            <span>简短说明</span>
            <textarea
              name="description"
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              value={description}
            />
          </label>

          <label className="field">
            <span>目标场景</span>
            <input
              maxLength={240}
              name="scenario"
              onChange={(event) => setScenario(event.target.value)}
              value={scenario}
            />
          </label>

          <label className="field">
            <span>内部备注</span>
            <textarea
              maxLength={4000}
              name="internalNote"
              onChange={(event) => setInternalNote(event.target.value)}
              placeholder="只用于后台管理，不会进入发布版本或作答结果。"
              rows={3}
              value={internalNote}
            />
          </label>

          <label className="field">
            <span>JSON schema 草稿</span>
            <textarea
              className="code-editor"
              name="schemaText"
              onChange={(event) => setSchemaText(event.target.value)}
              spellCheck={false}
              value={schemaText}
            />
          </label>

          <div className={validationError ? "notice warn preserve-lines" : "notice ok"}>
            {validationError ? validationError : "JSON 和 questionnaire schema 校验通过，可保存。"}
          </div>

          {initialValidation ? (
            <div className="notice warn preserve-lines">已保存草稿初始校验错误：{initialValidation}</div>
          ) : null}

          {state.error ? <pre className="form-error">{state.error}</pre> : null}

          <div className="actions split-actions">
            <button className="button" disabled={isPending || Boolean(validationError)} type="submit">
              {isPending ? "保存中..." : "保存草稿"}
            </button>
            <span className="inline-status">保存会格式化 JSON，并同步更新基础信息。</span>
          </div>
        </form>
      </section>

      <aside className="panel stack">
        {clientValidation.ok ? (
          <QuestionnairePreview questionnaire={clientValidation.questionnaire} />
        ) : (
          <div className="notice warn">当前编辑内容未通过校验，预览暂停。错误信息在编辑器下方显示。</div>
        )}
      </aside>
    </>
  );
}
