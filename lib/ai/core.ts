import { z } from "zod";
import { aiCallLogs } from "../db/schema.ts";

const DEFAULT_TIMEOUT_MS = 60_000;
const SELF_TEST_PROMPT = "Reply with exactly: TI_BUILDER_AI_CONNECTION_OK";

type FetchLike = typeof fetch;

type AiLogDb = {
  insert: (table: typeof aiCallLogs) => {
    values: (value: typeof aiCallLogs.$inferInsert) => {
      run: () => unknown;
    };
  };
};

export type AiEnv = {
  AI_API_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
};

export type AiCallPurpose =
  | "connection_self_test"
  | "schema_draft_generation"
  | "open_answer_scoring"
  | "debug_interpretation";

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiClientConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type AiClientDependencies = {
  db: AiLogDb;
  env: AiEnv;
  fetch?: FetchLike;
  now?: () => Date;
  monotonicNow?: () => number;
  id: () => string;
  timeoutMs?: number;
};

export type AiChatCompletionInput = {
  purpose: AiCallPurpose;
  messages: AiChatMessage[];
  inputSummary?: string;
  responseId?: string;
  questionId?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object";
  thinking?: "enabled" | "disabled";
};

export type AiChatCompletionResult = {
  content: string;
  model: string;
  latencyMs: number;
  attempts: number;
};

export type AiSelfTestResult = {
  ok: boolean;
  model: string | null;
  latencyMs: number;
  error: string | null;
};

class AiClientError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "AiClientError";
    this.retryable = retryable;
  }
}

const chatCompletionResponseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().optional(),
        message: z
          .object({
            content: z.string().nullable().optional(),
            reasoning_content: z.string().nullable().optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});

export function getAiClientConfig(env: AiEnv): AiClientConfig | null {
  if (!env.AI_API_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL) {
    return null;
  }

  return {
    baseUrl: env.AI_API_BASE_URL,
    apiKey: env.AI_API_KEY,
    model: env.AI_MODEL,
  };
}

function sanitizeBaseUrl(baseUrl?: string): string | null {
  if (!baseUrl) {
    return null;
  }

  try {
    const parsed = new URL(baseUrl);
    parsed.username = "";
    parsed.password = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

export function getAiConfigStatus(env: AiEnv) {
  return {
    configured: Boolean(env.AI_API_BASE_URL && env.AI_API_KEY && env.AI_MODEL),
    baseUrlConfigured: Boolean(env.AI_API_BASE_URL),
    baseUrl: sanitizeBaseUrl(env.AI_API_BASE_URL),
    apiKeyConfigured: Boolean(env.AI_API_KEY),
    model: env.AI_MODEL ?? null,
  };
}

export function joinAiBaseUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  return new URL(normalizedPath, normalizedBase).toString();
}

function isDeepSeekBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase().endsWith("deepseek.com");
  } catch {
    return false;
  }
}

function defaultThinkingForPurpose(purpose: AiCallPurpose): "enabled" | "disabled" {
  if (purpose === "debug_interpretation") {
    return "enabled";
  }

  return "disabled";
}

function defaultResponseFormatForPurpose(purpose: AiCallPurpose): "json_object" | undefined {
  return purpose === "schema_draft_generation" || purpose === "open_answer_scoring" ? "json_object" : undefined;
}

function buildChatCompletionBody(config: AiClientConfig, input: AiChatCompletionInput) {
  const isDeepSeek = isDeepSeekBaseUrl(config.baseUrl);
  const thinking = input.thinking ?? defaultThinkingForPurpose(input.purpose);
  const responseFormat = input.responseFormat ?? defaultResponseFormatForPurpose(input.purpose);

  return {
    model: config.model,
    messages: input.messages,
    max_tokens: input.maxTokens ?? 128,
    ...(isDeepSeek && thinking !== "enabled"
      ? {
          temperature: input.temperature ?? 0,
        }
      : !isDeepSeek
        ? {
            temperature: input.temperature ?? 0,
          }
        : {}),
    ...(responseFormat
      ? {
          response_format: {
            type: responseFormat,
          },
        }
      : {}),
    ...(isDeepSeek
      ? {
          thinking: {
            type: thinking,
          },
        }
      : {}),
  };
}

export function stripMarkdownCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export function parseAiJsonWithSchema<T>(raw: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(stripMarkdownCodeFences(raw)));
}

function summarizeError(error: unknown): string {
  if (error instanceof AiClientError || error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return String(error).slice(0, 500);
}

function redactSecret(value: string, secret?: string): string {
  if (!secret) {
    return value;
  }

  return value.split(secret).join("[redacted]");
}

function summarizeMessages(messages: AiChatMessage[]): string {
  return messages
    .map((message) => `${message.role}:${message.content}`)
    .join("\n")
    .slice(0, 1_000);
}

function logAiCall(
  db: AiLogDb,
  input: {
    purpose: AiCallPurpose;
    responseId?: string;
    questionId?: string;
    inputSummary: string;
    output?: string | null;
    status: "success" | "failure";
    error?: string | null;
    now: Date;
    id: string;
  },
) {
  db.insert(aiCallLogs)
    .values({
      id: input.id,
      purpose: input.purpose,
      responseId: input.responseId,
      questionId: input.questionId,
      inputSummary: input.inputSummary,
      output: input.output ?? null,
      status: input.status,
      error: input.error ?? null,
      createdAt: input.now,
    })
    .run();
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiClientError("AI request timed out after 60 seconds.", true);
    }

    throw new AiClientError(`AI request failed: ${summarizeError(error)}`, true);
  } finally {
    clearTimeout(timeout);
  }
}

function statusIsRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function callChatCompletionsOnce(
  config: AiClientConfig,
  input: AiChatCompletionInput,
  fetchImpl: FetchLike,
  timeoutMs: number,
) {
  const response = await fetchWithTimeout(
    fetchImpl,
    joinAiBaseUrl(config.baseUrl, "/chat/completions"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildChatCompletionBody(config, input)),
    },
    timeoutMs,
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new AiClientError(
      `AI request returned HTTP ${response.status}${responseText ? `: ${responseText.slice(0, 300)}` : ""}`,
      statusIsRetryable(response.status),
    );
  }

  let responseJson: unknown;

  try {
    responseJson = JSON.parse(responseText);
  } catch {
    throw new AiClientError("AI response was not valid JSON.", true);
  }

  const parsed = chatCompletionResponseSchema.safeParse(responseJson);

  if (!parsed.success) {
    throw new AiClientError("AI response did not match chat/completions shape.", true);
  }

  const firstChoice = parsed.data.choices[0];
  const content = firstChoice?.message?.content;

  if (!content) {
    const finishReason = firstChoice?.finish_reason;
    const hasReasoningContent = Boolean(firstChoice?.message?.reasoning_content);
    const suffix = hasReasoningContent
      ? " The response included reasoning_content but no final content; disable thinking mode or increase max_tokens."
      : "";

    throw new AiClientError(
      `AI response did not include message content${finishReason ? ` (finish_reason=${finishReason})` : ""}.${suffix}`,
      true,
    );
  }

  return {
    content,
    model: parsed.data.model ?? config.model,
  };
}

export async function callAiChatCompletionCore(
  input: AiChatCompletionInput,
  dependencies: AiClientDependencies,
): Promise<AiChatCompletionResult> {
  const config = getAiClientConfig(dependencies.env);
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const monotonicNow = dependencies.monotonicNow ?? Date.now;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const inputSummary = (input.inputSummary ?? summarizeMessages(input.messages)).slice(0, 1_000);
  const start = monotonicNow();
  let attempts = 0;

  if (!config) {
    const error = "AI configuration is incomplete. Set AI_API_BASE_URL, AI_API_KEY, and AI_MODEL.";
    logAiCall(dependencies.db, {
      purpose: input.purpose,
      responseId: input.responseId,
      questionId: input.questionId,
      inputSummary,
      status: "failure",
      error,
      now: now(),
      id: dependencies.id(),
    });
    throw new AiClientError(error, false);
  }

  try {
    let lastError: unknown;

    for (attempts = 1; attempts <= 2; attempts += 1) {
      try {
        const result = await callChatCompletionsOnce(config, input, fetchImpl, timeoutMs);
        const latencyMs = monotonicNow() - start;
        logAiCall(dependencies.db, {
          purpose: input.purpose,
          responseId: input.responseId,
          questionId: input.questionId,
          inputSummary,
          output: result.content.slice(0, 8_000),
          status: "success",
          now: now(),
          id: dependencies.id(),
        });

        return {
          content: result.content,
          model: result.model,
          latencyMs,
          attempts,
        };
      } catch (error) {
        lastError = error;

        if (!(error instanceof AiClientError) || !error.retryable || attempts >= 2) {
          throw error;
        }
      }
    }

    throw lastError;
  } catch (error) {
    const summarizedError = redactSecret(summarizeError(error), config?.apiKey);
    logAiCall(dependencies.db, {
      purpose: input.purpose,
      responseId: input.responseId,
      questionId: input.questionId,
      inputSummary,
      status: "failure",
      error: summarizedError,
      now: now(),
      id: dependencies.id(),
    });
    throw new AiClientError(summarizedError, false);
  }
}

export async function runAiConnectionSelfTestCore(dependencies: AiClientDependencies): Promise<AiSelfTestResult> {
  const model = dependencies.env.AI_MODEL ?? null;
  const monotonicNow = dependencies.monotonicNow ?? Date.now;
  const start = monotonicNow();

  try {
    const result = await callAiChatCompletionCore(
      {
        purpose: "connection_self_test",
        inputSummary: "Admin AI connection self-test",
        messages: [
          {
            role: "user",
            content: SELF_TEST_PROMPT,
          },
        ],
        maxTokens: 32,
        thinking: "disabled",
      },
      dependencies,
    );

    return {
      ok: true,
      model: result.model,
      latencyMs: result.latencyMs,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      model,
      latencyMs: monotonicNow() - start,
      error: summarizeError(error),
    };
  }
}
