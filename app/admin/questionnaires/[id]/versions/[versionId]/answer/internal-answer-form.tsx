"use client";

import { nanoid } from "nanoid";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { QuestionnaireSchema } from "@/lib/schema/questionnaire";
import { submitInternalAnswerAction, type InternalAnswerFormState } from "./actions";

type InternalAnswerFormProps = {
  questionnaire: QuestionnaireSchema;
  versionId: string;
  storageKey: string;
  selectedMemberName: string;
};

type AnswerValue = string | string[];
type Answers = Record<string, AnswerValue>;

const initialState: InternalAnswerFormState = {};
const unfinishedAiStatuses = new Set(["pending", "scoring_open_answers", "generating_debug_interpretation"]);

function createInitialAnswers(questionnaire: QuestionnaireSchema): Answers {
  return Object.fromEntries(
    questionnaire.questions.map((question) => [question.id, question.type === "multiple_choice" ? [] : ""]),
  );
}

function readStoredState(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(storageKey);

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function hasOpenTextQuestion(questionnaire: QuestionnaireSchema) {
  return questionnaire.questions.some((question) => question.type === "open_text");
}

function statusExplanation(status: string, includesOpenText: boolean) {
  if (unfinishedAiStatuses.has(status)) {
    return includesOpenText
      ? "开放题已提交，AI 尚未返回完整评分；后台 worker 正在评分并生成 debug 解读，结果页会自动轮询更新。"
      : "作答已提交，后台正在生成 debug 解读，结果页会自动轮询更新。";
  }

  if (status === "completed") {
    return "评分已完成，可以查看内部结果页。";
  }

  if (status === "partially_failed") {
    return "部分开放题 AI 评分失败，但原始作答和已生成分数已保留；结果页会显示失败原因。";
  }

  if (status === "failed") {
    return "开放题 AI 评分失败，但原始作答已保留；结果页会显示失败原因，可稍后重新评分。";
  }

  return "作答已提交，可以查看内部结果页确认当前状态。";
}

export function InternalAnswerForm({
  questionnaire,
  versionId,
  storageKey,
  selectedMemberName,
}: InternalAnswerFormProps) {
  const [state, formAction, isPending] = useActionState(submitInternalAnswerAction, initialState);
  const [clientSubmissionId, setClientSubmissionId] = useState("");
  const [answers, setAnswers] = useState<Answers>(() => createInitialAnswers(questionnaire));
  const [respondentName, setRespondentName] = useState(selectedMemberName);
  const [respondentNote, setRespondentNote] = useState("");
  const answersJson = useMemo(() => JSON.stringify(answers), [answers]);
  const includesOpenText = useMemo(() => hasOpenTextQuestion(questionnaire), [questionnaire]);
  const responseStatusExplanation = state.response
    ? statusExplanation(state.response.aiScoringStatus, includesOpenText)
    : null;

  useEffect(() => {
    const stored = readStoredState(storageKey);

    setClientSubmissionId(
      typeof stored?.clientSubmissionId === "string" && stored.clientSubmissionId
        ? stored.clientSubmissionId
        : nanoid(21),
    );
    setAnswers(
      stored?.answers && typeof stored.answers === "object" ? stored.answers : createInitialAnswers(questionnaire),
    );
    setRespondentName(typeof stored?.respondentName === "string" ? stored.respondentName : selectedMemberName);
    setRespondentNote(typeof stored?.respondentNote === "string" ? stored.respondentNote : "");
  }, [questionnaire, selectedMemberName, storageKey]);

  useEffect(() => {
    if (!clientSubmissionId) {
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        clientSubmissionId,
        answers,
        respondentName,
        respondentNote,
      }),
    );
  }, [answers, clientSubmissionId, respondentName, respondentNote, storageKey]);

  function setAnswer(questionId: string, value: AnswerValue) {
    setAnswers((current) => ({
      ...current,
      [questionId]: value,
    }));
  }

  function toggleMultipleAnswer(questionId: string, optionId: string, checked: boolean) {
    const currentValue = answers[questionId];
    const currentAnswers = Array.isArray(currentValue) ? currentValue : [];

    setAnswer(
      questionId,
      checked ? [...currentAnswers, optionId] : currentAnswers.filter((selectedOptionId) => selectedOptionId !== optionId),
    );
  }

  return (
    <section className="panel stack">
      <div>
        <div className="kicker">Internal Answer</div>
        <h2>内部作答</h2>
        <p className="lead compact">
          当前归因成员：{selectedMemberName}。提交会绑定到此发布版本，并用本机保存的 clientSubmissionId 保证刷新或重试不重复落库。
        </p>
      </div>

      <form action={formAction} className="form">
        <input name="versionId" type="hidden" value={versionId} />
        <input name="clientSubmissionId" type="hidden" value={clientSubmissionId} />
        <input name="answersJson" type="hidden" value={answersJson} />

        <label className="field">
          <span>姓名 / 昵称</span>
          <input
            maxLength={160}
            name="respondentName"
            onChange={(event) => setRespondentName(event.target.value)}
            required
            value={respondentName}
          />
        </label>

        <label className="field">
          <span>身份 / 备注</span>
          <textarea
            maxLength={2000}
            name="respondentNote"
            onChange={(event) => setRespondentNote(event.target.value)}
            rows={3}
            value={respondentNote}
          />
        </label>

        <div className="answer-list">
          {questionnaire.questions.map((question, index) => (
            <article className="answer-question" key={question.id}>
              <div className="question-heading">
                <span className="badge subtle">Q{index + 1}</span>
                <div>
                  <h3>{question.title}</h3>
                  <p className="muted-code">
                    {question.id} · {question.type}
                  </p>
                </div>
              </div>

              {question.type === "single_choice" ? (
                <div className="answer-options">
                  {question.options.map((option) => (
                    <label className="choice-line" key={option.id}>
                      <input
                        checked={answers[question.id] === option.id}
                        name={`answer-${question.id}`}
                        onChange={() => setAnswer(question.id, option.id)}
                        required
                        type="radio"
                        value={option.id}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {question.type === "multiple_choice" ? (
                <div className="answer-options">
                  {question.options.map((option) => {
                    const currentValue = answers[question.id];
                    const selectedOptions = Array.isArray(currentValue) ? currentValue : [];

                    return (
                      <label className="choice-line" key={option.id}>
                        <input
                          checked={selectedOptions.includes(option.id)}
                          name={`answer-${question.id}-${option.id}`}
                          onChange={(event) => toggleMultipleAnswer(question.id, option.id, event.target.checked)}
                          type="checkbox"
                          value={option.id}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {question.type === "open_text" ? (
                <label className="field">
                  <span>开放回答</span>
                  <textarea
                    onChange={(event) => setAnswer(question.id, event.target.value)}
                    rows={5}
                    value={typeof answers[question.id] === "string" ? answers[question.id] : ""}
                  />
                </label>
              ) : null}
            </article>
          ))}
        </div>

        {state.error ? <pre className="form-error">{state.error}</pre> : null}

        {state.response ? (
          <div className={`notice ${unfinishedAiStatuses.has(state.response.aiScoringStatus) ? "info" : "ok"}`}>
            提交成功。Response ID: <code>{state.response.id}</code> · Result token:{" "}
            <code>{state.response.resultToken}</code> · 状态：{state.response.aiScoringStatus}
            {state.response.created ? "" : " · 已返回既有幂等提交"}
            {responseStatusExplanation ? <p>{responseStatusExplanation}</p> : null}
            <Link className="text-link" href={`/admin/responses/${state.response.id}`}>
              查看内部结果页
            </Link>
          </div>
        ) : null}

        <div className="actions split-actions">
          <button className="button" disabled={isPending || !clientSubmissionId} type="submit">
            {isPending ? "提交中..." : "提交作答"}
          </button>
          <span className="inline-status">
            {includesOpenText
              ? "包含开放题时，提交会先返回记录；AI 评分和 debug 解读随后在后台完成。"
              : "提交后会立即返回 responseId、resultToken 和初始评分状态。"}
          </span>
        </div>
      </form>
    </section>
  );
}
