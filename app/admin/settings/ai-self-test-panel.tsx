"use client";

import { useState } from "react";

type AiConfigStatus = {
  configured: boolean;
  baseUrlConfigured: boolean;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
  model: string | null;
};

type SelfTestResult = {
  ok: boolean;
  model: string | null;
  latencyMs: number;
  error: string | null;
};

export function AiSelfTestPanel({ config }: { config: AiConfigStatus }) {
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function runSelfTest() {
    setIsRunning(true);
    setRequestError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/ai/self-test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setRequestError(body?.error ?? `请求失败：HTTP ${response.status}`);
        return;
      }

      setResult(body);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "请求失败");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="panel stack">
      <div className="section-heading">
        <div>
          <div className="kicker">AI Settings</div>
          <h2>连接自测</h2>
          <p className="lead compact">使用服务端环境变量发起一次最小 chat/completions 请求，并写入 AI 调用日志。</p>
        </div>
        <button className="button" disabled={isRunning} onClick={runSelfTest} type="button">
          {isRunning ? "测试中..." : "运行自测"}
        </button>
      </div>

      <dl className="meta-list settings-meta">
        <div>
          <dt>Base URL</dt>
          <dd>{config.baseUrl ?? (config.baseUrlConfigured ? "已配置，格式无法显示" : "未配置")}</dd>
        </div>
        <div>
          <dt>API Key</dt>
          <dd>{config.apiKeyConfigured ? "已配置" : "未配置"}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{config.model ?? "未配置"}</dd>
        </div>
      </dl>

      {!config.configured ? (
        <div className="notice warn">AI 配置不完整。请在服务端设置 AI_API_BASE_URL、AI_API_KEY 和 AI_MODEL。</div>
      ) : null}

      {requestError ? <div className="notice warn">{requestError}</div> : null}

      {result ? (
        <div className={result.ok ? "notice ok" : "notice warn"}>
          <strong>{result.ok ? "连接成功" : "连接失败"}</strong>
          <dl className="meta-list compact-meta self-test-result">
            <div>
              <dt>Model</dt>
              <dd>{result.model ?? "未知"}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{result.latencyMs} ms</dd>
            </div>
            <div>
              <dt>Error</dt>
              <dd>{result.error ?? "无"}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
