import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createDb } from "@/lib/db/client";
import { responses } from "@/lib/db/schema";

type ResponseStatusRouteProps = {
  params: Promise<{
    responseId: string;
  }>;
};

const responseIdSchema = z.string().trim().min(1).max(120);

export async function GET(_request: Request, { params }: ResponseStatusRouteProps) {
  const { responseId } = await params;
  const parsed = responseIdSchema.safeParse(responseId);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid response ID." }, { status: 400 });
  }

  const item = createDb()
    .select({
      responseId: responses.id,
      aiScoringStatus: responses.aiScoringStatus,
      aiScoringError: responses.aiScoringError,
      perQuestionScores: responses.perQuestionScores,
      finalVector: responses.finalVector,
      debugInterpretation: responses.debugInterpretation,
    })
    .from(responses)
    .where(eq(responses.id, parsed.data))
    .get();

  if (!item) {
    return NextResponse.json({ error: "Response not found." }, { status: 404 });
  }

  return NextResponse.json({
    responseId: item.responseId,
    aiScoringStatus: item.aiScoringStatus,
    aiScoringError: item.aiScoringError,
    hasPerQuestionScores: Boolean(item.perQuestionScores),
    hasFinalVector: Boolean(item.finalVector),
    hasDebugInterpretation: Boolean(item.debugInterpretation),
  });
}
