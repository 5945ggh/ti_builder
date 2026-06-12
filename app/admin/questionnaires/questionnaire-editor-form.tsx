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
    <div className="editor-workspace">
      <details className="panel disclosure-panel" style={{ borderLeft: "4px solid var(--color-accent)" }}>
        <summary>
          <div>
            <div className="kicker">[ SYS.AI_COGNITIVE_GENERATOR ]</div>
            <h2 style={{ fontSize: "var(--text-lg)" }}>AI 辅助 Schema 生成与修改建议</h2>
            <p className="lead compact" style={{ fontSize: "var(--text-sm)" }}>
              粘贴原始测评大纲或文本，自动生成结构化 JSON 草稿。
            </p>
          </div>
        </summary>

        <div className="disclosure-body stack">
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
                placeholder="粘贴原始文案、大纲维度、选项设置或开放题评分要求..."
                required
                rows={8}
              />
            </label>

            {"error" in generateState && generateState.error ? (
              <pre className="form-error">{generateState.error}</pre>
            ) : null}

            <div className="actions split-actions">
              <button className="button" disabled={isGenerating} type="submit" style={{ backgroundColor: "var(--color-accent)", borderColor: "var(--color-accent)", borderBottomColor: "var(--color-accent-hover)" }}>
                {isGenerating ? "AI 生成中..." : "启动 AI 生成"}
              </button>
              <span className="inline-status">
                调用会以 <code>schema_draft_generation</code> 写入 AI 交互日志。
              </span>
            </div>
          </form>

          {generateState.status === "invalid" ? (
            <div className="notice warn preserve-lines">
              <strong>[异常] AI 输出解析校验失败。</strong>
              {"\n"}
              {generateState.error}
              {"\n\n"}
              <strong>原始输出 / 安全摘录：</strong>
              {"\n"}
              {generateState.rawOutput ?? "AI 未返回可展示的原始输出。"}
            </div>
          ) : null}

          {generatedDraftText ? (
            <div className="generated-draft stack" style={{ borderTop: "2px dashed var(--color-border)", paddingTop: "var(--space-6)" }}>
              <div className={generatedValidation?.ok ? "notice ok" : "notice warn preserve-lines"}>
                {generatedValidation?.ok
                  ? "✓ AI 生成结果已通过本地 Schema 严格校验。点击下方确认合并至主编辑器。"
                  : `✗ AI 生成内容当前未通过格式校验：\n${generatedValidation?.error ?? ""}`}
              </div>

              <label className="field">
                <span>AI 建议草稿 JSON</span>
                <textarea
                  className="code-editor generated-code-editor"
                  onChange={(event) => setGeneratedDraftText(event.target.value)}
                  spellCheck={false}
                  value={generatedDraftText}
                />
              </label>

              {generateState.status === "valid" ? (
                <dl className="meta-list compact-meta" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <div>
                    <dt>模型</dt>
                    <dd>{generateState.model}</dd>
                  </div>
                  <div>
                    <dt>耗时</dt>
                    <dd>{generateState.latencyMs} ms</dd>
                  </div>
                  <div>
                    <dt>尝试次数</dt>
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
                  {isConfirming ? "同步中..." : "确认写入当前编辑器"}
                </button>
                <button className="button ghost" onClick={() => setGeneratedDraftText("")} type="button">
                  放弃生成结果
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </details>

      <div className="editor-main">
        <section className="panel stack editor-column">
          <div>
            <div className="kicker">[ 0x0A_DRAFT_EDITOR ]</div>
            <h2 style={{ fontSize: "var(--text-lg)" }}>草稿字段与 JSON 结构</h2>
            <p className="lead compact" style={{ fontSize: "var(--text-sm)" }}>
              保存前会自动运行校验，无效的配置将被拦截，防止破坏数据库一致性。
            </p>
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
              <span>问卷说明</span>
              <textarea
                name="description"
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                value={description}
              />
            </label>

            <label className="field">
              <span>核心场景 (Scenario ID)</span>
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
                placeholder="仅管理员后台可见，不会进入发布版本或面向测试者。"
                rows={3}
                value={internalNote}
              />
            </label>

            <label className="field">
              <span>JSON Schema</span>
              <textarea
                className="code-editor"
                name="schemaText"
                onChange={(event) => setSchemaText(event.target.value)}
                spellCheck={false}
                value={schemaText}
                style={{ height: "450px" }}
              />
            </label>

            <div className={validationError ? "notice warn preserve-lines" : "notice ok"}>
              {validationError ? validationError : "✓ JSON 格式及 Questionnaire Schema 校验通过。"}
            </div>

            {initialValidation ? (
              <div className="notice warn preserve-lines">初始化错误提示：{initialValidation}</div>
            ) : null}

            {state.error ? <pre className="form-error">{state.error}</pre> : null}

            <div className="actions split-actions">
              <button className="button" disabled={isPending || Boolean(validationError)} type="submit">
                {isPending ? "保存中..." : "保存草稿配置"}
              </button>
              <span className="inline-status">
                保存将自动美化 JSON 并更新上方字段。
              </span>
            </div>
          </form>
        </section>

        <aside className="preview-column">
          {clientValidation.ok ? (
            <QuestionnairePreview questionnaire={clientValidation.questionnaire} />
          ) : (
            <div className="notice warn" style={{ padding: "var(--space-6)" }}>
              <strong>[暂停预览]</strong>
              {"\n"}
              JSON 校验错误导致实时渲染挂起，请修复编辑器下方的格式错误。
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
