"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { callAiChatCompletion } from "@/lib/ai/client";
import { requireSelectedAdminMember } from "@/lib/auth/admin";
import { createDb } from "@/lib/db/client";
import { rescoreResponse } from "@/lib/responses/rescore";

const rescoreResponseFormSchema = z.object({
  responseId: z.string().trim().min(1, "Response ID is required."),
});

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function redirectWithRescoreResult(responseId: string, status: "ok" | "error", message: string) {
  const params = new URLSearchParams({
    rescore: status,
    message: message.slice(0, 500),
  });

  redirect(`/admin/responses/${responseId}?${params.toString()}`);
}

export async function rescoreResponseAction(formData: FormData) {
  await requireSelectedAdminMember();

  const parsed = rescoreResponseFormSchema.safeParse({
    responseId: formValue(formData, "responseId"),
  });

  if (!parsed.success) {
    const fallbackResponseId = formValue(formData, "responseId") || "unknown";
    return redirectWithRescoreResult(
      fallbackResponseId,
      "error",
      parsed.error.issues.map((issue) => issue.message).join("\n"),
    );
  }

  const db = createDb();
  const result = await rescoreResponse({
    db,
    responseId: parsed.data.responseId,
    callAi: (input) => callAiChatCompletion(input, { db }),
  });

  revalidatePath(`/admin/responses/${parsed.data.responseId}`);

  if (!result.ok) {
    return redirectWithRescoreResult(parsed.data.responseId, "error", result.error);
  }

  return redirectWithRescoreResult(
    parsed.data.responseId,
    "ok",
    `Rescored ${result.scoredQuestionCount} open question(s); ${result.failedQuestionCount} failed; status ${result.status}.`,
  );
}
