import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";
import {
  callAiChatCompletionCore,
  getAiConfigStatus,
  joinAiBaseUrl,
  parseAiJsonWithSchema,
  runAiConnectionSelfTestCore,
} from "./core.ts";
import { z } from "zod";

const { aiCallLogs } = schema;

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "ti-builder-ai-"));
  const sqlite = new Database(join(directory, "test.sqlite"));

  sqlite.exec(`
    CREATE TABLE ai_call_logs (
      id text PRIMARY KEY NOT NULL,
      purpose text NOT NULL,
      response_id text,
      question_id text,
      input_summary text DEFAULT '' NOT NULL,
      output text,
      status text NOT NULL,
      error text,
      created_at integer NOT NULL
    );
  `);

  return {
    db: drizzle(sqlite, { schema }),
    cleanup() {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function baseDependencies(db, overrides = {}) {
  let idCounter = 0;
  let ticks = 0;

  return {
    db,
    env: {
      DATABASE_URL: "file::memory:",
      AI_API_BASE_URL: "https://ai.example.test/v1/",
      AI_API_KEY: "secret-test-key",
      AI_MODEL: "test-model",
    },
    now: () => new Date("2026-06-11T00:00:00.000Z"),
    monotonicNow: () => {
      ticks += 25;
      return ticks;
    },
    id: () => {
      idCounter += 1;
      return `ai_log_${String(idCounter).padStart(15, "0")}`;
    },
    ...overrides,
  };
}

function readLogs(db) {
  return db.select().from(aiCallLogs).all();
}

describe("AI client", () => {
  it("joins OpenAI-compatible base URLs robustly", () => {
      assert.equal(
        joinAiBaseUrl("https://ai.example.test/v1", "/chat/completions"),
        "https://ai.example.test/v1/chat/completions",
      );
      assert.equal(
        joinAiBaseUrl("https://ai.example.test/v1/", "chat/completions"),
        "https://ai.example.test/v1/chat/completions",
      );
  });

  it("targets configured base URL and model and logs success without secrets", async () => {
    const { db, cleanup } = createTestDb();
    const requests = [];

    try {
      const result = await callAiChatCompletionCore(
        {
          purpose: "connection_self_test",
          inputSummary: "safe summary",
          messages: [{ role: "user", content: "ping" }],
        },
        baseDependencies(db, {
          fetch: async (url, init) => {
            requests.push({
              url,
              headers: Object.fromEntries(new Headers(init.headers).entries()),
              body: JSON.parse(init.body),
            });

            return new Response(
              JSON.stringify({
                model: "returned-model",
                choices: [{ message: { content: "pong" } }],
              }),
              { status: 200 },
            );
          },
        }),
      );

      assert.equal(result.content, "pong");
      assert.equal(result.model, "returned-model");
      assert.equal(result.attempts, 1);
      assert.equal(requests[0].url, "https://ai.example.test/v1/chat/completions");
      assert.equal(requests[0].body.model, "test-model");
      assert.equal(requests[0].headers.authorization, "Bearer secret-test-key");

      const logs = readLogs(db);
      assert.equal(logs.length, 1);
      assert.equal(logs[0].status, "success");
      assert.equal(logs[0].purpose, "connection_self_test");
      assert.equal(logs[0].inputSummary, "safe summary");
      assert.equal(logs[0].output, "pong");
      assert.equal(JSON.stringify(logs).includes("secret-test-key"), false);
      assert.equal(JSON.stringify(logs).includes("authorization"), false);
    } finally {
      cleanup();
    }
  });

  it("uses purpose-specific DeepSeek thinking and JSON options", async () => {
    const { db, cleanup } = createTestDb();
    const requests = [];
    const responseContents = ["TI_BUILDER_AI_CONNECTION_OK", "{}", "debug text"];
    const dependencies = baseDependencies(db, {
      env: {
        AI_API_BASE_URL: "https://api.deepseek.com/v1",
        AI_API_KEY: "secret-test-key",
        AI_MODEL: "deepseek-v4-pro",
      },
      fetch: async (_url, init) => {
        requests.push(JSON.parse(init.body));

        return new Response(
          JSON.stringify({
            model: "deepseek-v4-pro",
            choices: [{ message: { content: responseContents.shift() } }],
          }),
          { status: 200 },
        );
      },
    });

    try {
      const result = await callAiChatCompletionCore(
        {
          purpose: "connection_self_test",
          messages: [{ role: "user", content: "ping" }],
          maxTokens: 32,
        },
        dependencies,
      );
      const jsonResult = await callAiChatCompletionCore(
        {
          purpose: "schema_draft_generation",
          messages: [{ role: "user", content: "return json" }],
          maxTokens: 256,
        },
        dependencies,
      );
      const debugResult = await callAiChatCompletionCore(
        {
          purpose: "debug_interpretation",
          messages: [{ role: "user", content: "explain" }],
          maxTokens: 256,
        },
        dependencies,
      );

      assert.equal(result.content, "TI_BUILDER_AI_CONNECTION_OK");
      assert.equal(jsonResult.content, "{}");
      assert.equal(debugResult.content, "debug text");
      assert.deepEqual(requests[0].thinking, {
        type: "disabled",
      });
      assert.equal(requests[0].response_format, undefined);
      assert.deepEqual(requests[1].thinking, {
        type: "disabled",
      });
      assert.deepEqual(requests[1].response_format, {
        type: "json_object",
      });
      assert.deepEqual(requests[2].thinking, {
        type: "enabled",
      });
      assert.equal(requests[2].response_format, undefined);
    } finally {
      cleanup();
    }
  });

  it("reports reasoning-only responses with actionable detail", async () => {
    const { db, cleanup } = createTestDb();

    try {
      const result = await runAiConnectionSelfTestCore(
        baseDependencies(db, {
          fetch: async () =>
            new Response(
              JSON.stringify({
                model: "reasoning-model",
                choices: [
                  {
                    finish_reason: "length",
                    message: {
                      content: null,
                      reasoning_content: "thinking without final answer",
                    },
                  },
                ],
              }),
              { status: 200 },
            ),
        }),
      );

      assert.equal(result.ok, false);
      assert.match(result.error, /finish_reason=length/);
      assert.match(result.error, /reasoning_content/);
      assert.match(result.error, /disable thinking mode or increase max_tokens/);
    } finally {
      cleanup();
    }
  });

  it("retries one safe failure and logs only the final success", async () => {
    const { db, cleanup } = createTestDb();
    let calls = 0;

    try {
      const result = await callAiChatCompletionCore(
        {
          purpose: "connection_self_test",
          messages: [{ role: "user", content: "ping" }],
        },
        baseDependencies(db, {
          fetch: async () => {
            calls += 1;

            if (calls === 1) {
              return new Response("temporary outage", { status: 503 });
            }

            return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
          },
        }),
      );

      assert.equal(result.content, "ok");
      assert.equal(result.attempts, 2);
      assert.equal(calls, 2);
      const logs = readLogs(db);
      assert.equal(logs.length, 1);
      assert.equal(logs[0].status, "success");
    } finally {
      cleanup();
    }
  });

  it("logs failed calls and does not include request secrets", async () => {
    const { db, cleanup } = createTestDb();

    try {
      const result = await runAiConnectionSelfTestCore(
        baseDependencies(db, {
          fetch: async () => new Response("bad credentials secret-test-key", { status: 401 }),
        }),
      );

      assert.equal(result.ok, false);
      assert.equal(result.model, "test-model");
      assert.match(result.error, /HTTP 401/);

      const logs = readLogs(db);
      assert.equal(logs.length, 1);
      assert.equal(logs[0].status, "failure");
      assert.match(logs[0].error, /HTTP 401/);
      assert.equal(JSON.stringify(logs).includes("secret-test-key"), false);
      assert.equal(JSON.stringify(logs).includes("authorization"), false);
      assert.equal(result.error.includes("secret-test-key"), false);
    } finally {
      cleanup();
    }
  });

  it("logs invalid config without calling fetch", async () => {
    const { db, cleanup } = createTestDb();
    let fetchCalled = false;

    try {
      const result = await runAiConnectionSelfTestCore(
        baseDependencies(db, {
          env: {
            DATABASE_URL: "file::memory:",
            AI_API_BASE_URL: "https://ai.example.test/v1",
            AI_MODEL: "test-model",
          },
          fetch: async () => {
            fetchCalled = true;
            return new Response("{}");
          },
        }),
      );

      assert.equal(result.ok, false);
      assert.equal(fetchCalled, false);
      assert.match(result.error, /configuration is incomplete/);

      const logs = readLogs(db);
      assert.equal(logs.length, 1);
      assert.equal(logs[0].status, "failure");
      assert.match(logs[0].error, /configuration is incomplete/);
    } finally {
      cleanup();
    }
  });

  it("parses fenced AI JSON with zod", () => {
    const parsed = parseAiJsonWithSchema(
      '```json\n{"ok":true,"count":2}\n```',
      z.object({
        ok: z.boolean(),
        count: z.number(),
      }),
    );

    assert.deepEqual(parsed, { ok: true, count: 2 });
  });

  it("reports sanitized config status", () => {
    assert.deepEqual(
      getAiConfigStatus({
        AI_API_BASE_URL: "https://ai.example.test/v1",
        AI_API_KEY: "secret-test-key",
        AI_MODEL: "test-model",
      }),
      {
        configured: true,
        baseUrlConfigured: true,
        baseUrl: "https://ai.example.test/v1",
        apiKeyConfigured: true,
        model: "test-model",
      },
    );
  });

  it("redacts credentials from displayed base URL config status", () => {
    const status = getAiConfigStatus({
      AI_API_BASE_URL: "https://user:password@ai.example.test/v1",
      AI_API_KEY: "secret-test-key",
      AI_MODEL: "test-model",
    });

    assert.equal(status.baseUrl, "https://ai.example.test/v1");
    assert.equal(status.apiKeyConfigured, true);
    assert.equal(JSON.stringify(status).includes("password"), false);
    assert.equal(JSON.stringify(status).includes("secret-test-key"), false);
  });
});
