import { NextResponse } from "next/server";
import { createDb } from "@/lib/db/client";
import { submitFeedback } from "@/lib/responses/feedback";

type FeedbackRouteContext = {
  params: Promise<{
    resultToken: string;
  }>;
};

export async function POST(request: Request, context: FeedbackRouteContext) {
  const { resultToken } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const payload = typeof body === "object" && body !== null ? body : {};
  const result = submitFeedback(createDb(), {
    ...payload,
    resultToken,
  });

  if (!result.ok) {
    const status = result.error === "Result not found." ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    feedback: {
      updated: result.feedback.updated,
    },
  });
}
