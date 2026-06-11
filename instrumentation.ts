export const runtime = "nodejs";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startOpenAnswerScoringWorker } = await import("./lib/responses/open-answer-scoring-worker");

  startOpenAnswerScoringWorker();
}
