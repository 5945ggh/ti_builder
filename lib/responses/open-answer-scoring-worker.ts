import "server-only";
import { callAiChatCompletion } from "../ai/client";
import { createDb } from "../db/client";
import { processNextDebugInterpretationResponse } from "./debug-interpretation";
import { processNextOpenAnswerResponse } from "./open-answer-scoring";

const POLL_INTERVAL_MS = 2_500;

declare global {
  var __tiBuilderOpenAnswerScoringWorker:
    | {
        started: boolean;
        timer: ReturnType<typeof setInterval> | null;
        running: boolean;
      }
    | undefined;
}

function workerState() {
  globalThis.__tiBuilderOpenAnswerScoringWorker ??= {
    started: false,
    timer: null,
    running: false,
  };

  return globalThis.__tiBuilderOpenAnswerScoringWorker;
}

async function tick() {
  const state = workerState();

  if (state.running) {
    return;
  }

  state.running = true;

  try {
    const db = createDb();

    for (;;) {
      const result = await processNextOpenAnswerResponse({
        db,
        callAi: callAiChatCompletion,
      });

      if (!result) {
        break;
      }
    }

    for (;;) {
      const result = await processNextDebugInterpretationResponse({
        db,
        callAi: callAiChatCompletion,
      });

      if (!result) {
        break;
      }
    }
  } catch (error) {
    console.error("[open-answer-scoring-worker] tick failed", error);
  } finally {
    state.running = false;
  }
}

export function startOpenAnswerScoringWorker() {
  const state = workerState();

  if (state.started) {
    return;
  }

  state.started = true;
  void tick();
  state.timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
}
