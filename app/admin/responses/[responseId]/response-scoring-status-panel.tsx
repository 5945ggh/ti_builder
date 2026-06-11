"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AiScoringStatus } from "@/lib/db/schema";

type ResponseScoringStatusPayload = {
  responseId: string;
  aiScoringStatus: AiScoringStatus;
  aiScoringError: string | null;
  hasPerQuestionScores: boolean;
  hasFinalVector: boolean;
  hasDebugInterpretation: boolean;
};

type ResponseScoringStatusPanelProps = {
  responseId: string;
  initialStatus: AiScoringStatus;
  initialError: string | null;
  initialHasFinalVector: boolean;
  initialHasDebugInterpretation: boolean;
};

const unfinishedStatuses = new Set<AiScoringStatus>([
  "pending",
  "scoring_open_answers",
  "generating_debug_interpretation",
]);

function parseError(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function statusMessage(input: {
  status: AiScoringStatus;
  hasFinalVector: boolean;
  hasDebugInterpretation: boolean;
  hasDebugInterpretationFailure: boolean;
}) {
  if (input.status === "pending") {
    return "开放题已入队，AI 评分尚未返回；后台 worker 会自动处理。";
  }

  if (input.status === "scoring_open_answers") {
    return "正在调用 AI 评分开放题，原始作答已保存。";
  }

  if (input.status === "generating_debug_interpretation") {
    return "最终向量已生成，正在调用 AI 生成内部 debug 解读。";
  }

  if (input.status === "completed" && input.hasDebugInterpretation) {
    return "评分和内部 debug 解读已完成。";
  }

  if (input.status === "completed" && input.hasFinalVector) {
    return input.hasDebugInterpretationFailure
      ? "评分已完成，内部 debug 解读生成失败；原始分数已保留。"
      : "评分已完成，正在等待内部 debug 解读。";
  }

  if (input.status === "partially_failed") {
    return "部分开放题 AI 评分失败；已成功的分数、最终向量和原始作答已保留。";
  }

  if (input.status === "failed") {
    return "开放题 AI 评分失败；原始作答已保留，可以稍后重新评分。";
  }

  return "正在读取评分状态。";
}

export function ResponseScoringStatusPanel({
  responseId,
  initialStatus,
  initialError,
  initialHasFinalVector,
  initialHasDebugInterpretation,
}: ResponseScoringStatusPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AiScoringStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);
  const [pollError, setPollError] = useState<string | null>(null);
  const [hasFinalVector, setHasFinalVector] = useState(initialHasFinalVector);
  const [hasDebugInterpretation, setHasDebugInterpretation] = useState(initialHasDebugInterpretation);
  const hasRefreshedForDebugInterpretation = useRef(false);
  const displayError = useMemo(() => parseError(error), [error]);
  const hasDebugInterpretationFailure = useMemo(() => {
    if (!error) {
      return false;
    }

    try {
      const parsed = JSON.parse(error) as Record<string, unknown>;
      const debugInterpretation = parsed.debug_interpretation;

      return (
        debugInterpretation !== null &&
        typeof debugInterpretation === "object" &&
        "status" in debugInterpretation &&
        debugInterpretation.status === "failed"
      );
    } catch {
      return false;
    }
  }, [error]);
  const isPolling =
    unfinishedStatuses.has(status) || (!hasDebugInterpretation && !hasDebugInterpretationFailure);
  const readableStatus = statusMessage({
    status,
    hasFinalVector,
    hasDebugInterpretation,
    hasDebugInterpretationFailure,
  });

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch(`/api/admin/responses/${encodeURIComponent(responseId)}/status`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Status request failed with HTTP ${response.status}.`);
        }

        const payload = (await response.json()) as ResponseScoringStatusPayload;

        if (cancelled) {
          return;
        }

        setStatus(payload.aiScoringStatus);
        setError(payload.aiScoringError);
        setHasFinalVector(payload.hasFinalVector);
        setHasDebugInterpretation(payload.hasDebugInterpretation);
        if (payload.hasDebugInterpretation && !hasRefreshedForDebugInterpretation.current) {
          hasRefreshedForDebugInterpretation.current = true;
          router.refresh();
        }
        setPollError(null);
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        setPollError(requestError instanceof Error ? requestError.message : "Status polling failed.");
      }
    }

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 2_500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isPolling, responseId, router]);

  return (
    <section className={`notice ${status === "completed" ? "ok" : status === "failed" ? "warn" : "info"}`}>
      <strong>评分状态：</strong>
      {status}
      {isPolling ? " · 正在轮询评分与 debug 解读结果" : ""}
      {hasFinalVector === true ? " · 已生成最终向量" : ""}
      {hasDebugInterpretation === true ? " · 已生成 debug 解读" : ""}
      {pollError ? ` · 轮询错误：${pollError}` : ""}
      <p>{readableStatus}</p>
      {displayError ? (
        <pre className="status-error-block" aria-label="AI scoring error">
          {displayError}
        </pre>
      ) : null}
    </section>
  );
}
