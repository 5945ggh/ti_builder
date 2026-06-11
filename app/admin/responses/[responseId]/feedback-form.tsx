"use client";

import { useState, type FormEvent } from "react";

type FeedbackFormProps = {
  resultToken: string;
  initialFeedback: {
    interestScore: number;
    accuracyScore: number;
    shareWillingnessScore: number;
    usefulnessScore: number;
    comment: string;
  } | null;
};

type FeedbackStatus = {
  tone: "info" | "ok" | "warn";
  message: string;
} | null;

const scoreOptions = [1, 2, 3, 4, 5];

export function FeedbackForm({ resultToken, initialFeedback }: FeedbackFormProps) {
  const [status, setStatus] = useState<FeedbackStatus>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      interestScore: formData.get("interestScore"),
      accuracyScore: formData.get("accuracyScore"),
      shareWillingnessScore: formData.get("shareWillingnessScore"),
      usefulnessScore: formData.get("usefulnessScore"),
      comment: formData.get("comment"),
    };

    try {
      const response = await fetch(`/api/public/responses/${encodeURIComponent(resultToken)}/feedback`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as
        | {
            ok: true;
            feedback: {
              updated: boolean;
            };
          }
        | {
            ok: false;
            error: string;
          };

      if (!response.ok || !result.ok) {
        setStatus({
          tone: "warn",
          message: result.ok ? "Feedback submit failed." : result.error,
        });
        return;
      }

      setStatus({
        tone: "ok",
        message: result.feedback.updated ? "反馈已更新。" : "反馈已提交。",
      });
    } catch {
      setStatus({
        tone: "warn",
        message: "反馈提交失败，请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="feedback-form" onSubmit={onSubmit}>
      <div className="feedback-grid">
        <ScoreSelect
          defaultValue={initialFeedback?.interestScore ?? 4}
          label="有趣程度"
          name="interestScore"
        />
        <ScoreSelect
          defaultValue={initialFeedback?.accuracyScore ?? 4}
          label="准确程度"
          name="accuracyScore"
        />
        <ScoreSelect
          defaultValue={initialFeedback?.shareWillingnessScore ?? 3}
          label="分享意愿"
          name="shareWillingnessScore"
        />
        <ScoreSelect
          defaultValue={initialFeedback?.usefulnessScore ?? 4}
          label="帮助程度"
          name="usefulnessScore"
        />
      </div>

      <label className="field full-width">
        <span>备注</span>
        <textarea
          defaultValue={initialFeedback?.comment ?? ""}
          maxLength={4000}
          name="comment"
          placeholder="哪些结果有启发，哪些地方不准或需要调整。"
          rows={4}
        />
      </label>

      <div className="actions">
        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "提交中..." : initialFeedback ? "更新反馈" : "提交反馈"}
        </button>
        <span className="inline-status">再次提交会更新同一条反馈，不会创建重复记录。</span>
      </div>

      {status ? <div className={`notice ${status.tone}`}>{status.message}</div> : null}
    </form>
  );
}

function ScoreSelect({ defaultValue, label, name }: { defaultValue: number; label: string; name: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select defaultValue={defaultValue} name={name} required>
        {scoreOptions.map((score) => (
          <option key={score} value={score}>
            {score}
          </option>
        ))}
      </select>
    </label>
  );
}
