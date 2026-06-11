import "server-only";
import { nanoid } from "nanoid";
import { createDb, type AppDb } from "../db/client";
import { getServerEnv, type ServerEnv } from "../env";
import {
  callAiChatCompletionCore,
  getAiClientConfig,
  getAiConfigStatus,
  joinAiBaseUrl,
  parseAiJsonWithSchema,
  runAiConnectionSelfTestCore,
  stripMarkdownCodeFences,
  type AiCallPurpose,
  type AiChatCompletionInput,
  type AiChatCompletionResult,
  type AiChatMessage,
  type AiClientConfig,
  type AiSelfTestResult,
} from "./core";

export {
  getAiClientConfig,
  getAiConfigStatus,
  joinAiBaseUrl,
  parseAiJsonWithSchema,
  stripMarkdownCodeFences,
  type AiCallPurpose,
  type AiChatCompletionInput,
  type AiChatCompletionResult,
  type AiChatMessage,
  type AiClientConfig,
  type AiSelfTestResult,
};

export type AiClientDependencies = {
  db?: AppDb;
  env?: Partial<ServerEnv>;
  fetch?: typeof fetch;
  now?: () => Date;
  monotonicNow?: () => number;
  id?: () => string;
  timeoutMs?: number;
};

function resolveDependencies(dependencies: AiClientDependencies = {}) {
  return {
    db: dependencies.db ?? createDb(),
    env: {
      ...getServerEnv(),
      ...dependencies.env,
    },
    fetch: dependencies.fetch,
    now: dependencies.now,
    monotonicNow: dependencies.monotonicNow,
    id: dependencies.id ?? nanoid,
    timeoutMs: dependencies.timeoutMs,
  };
}

export async function callAiChatCompletion(
  input: AiChatCompletionInput,
  dependencies: AiClientDependencies = {},
): Promise<AiChatCompletionResult> {
  return callAiChatCompletionCore(input, resolveDependencies(dependencies));
}

export async function runAiConnectionSelfTest(
  dependencies: AiClientDependencies = {},
): Promise<AiSelfTestResult> {
  return runAiConnectionSelfTestCore(resolveDependencies(dependencies));
}
