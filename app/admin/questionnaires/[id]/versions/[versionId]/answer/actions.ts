"use server";

import { requireSelectedAdminMember } from "@/lib/auth/admin";
import { createDb } from "@/lib/db/client";
import { submitResponse, type SubmitResponseResult } from "@/lib/responses/submit";

export type InternalAnswerFormState = {
  error?: string;
  response?: Extract<SubmitResponseResult, { ok: true }>["response"];
};

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function submitInternalAnswerAction(
  _state: InternalAnswerFormState,
  formData: FormData,
): Promise<InternalAnswerFormState> {
  const member = await requireSelectedAdminMember();
  const versionId = formValue(formData, "versionId");
  const clientSubmissionId = formValue(formData, "clientSubmissionId");
  const respondentName = formValue(formData, "respondentName");
  const respondentNote = formValue(formData, "respondentNote");
  const answersJson = formValue(formData, "answersJson");
  let answers: unknown;

  try {
    answers = JSON.parse(answersJson);
  } catch (error) {
    return {
      error: error instanceof Error ? `Answers JSON parse error: ${error.message}` : "Answers JSON parse error.",
    };
  }

  const result = submitResponse(createDb(), {
    versionId,
    source: "internal_member",
    memberId: member.id,
    submitterKey: member.id,
    respondentName,
    respondentNote,
    clientSubmissionId,
    answers: answers as Record<string, string | string[]>,
  });

  if (!result.ok) {
    return {
      error: result.error,
    };
  }

  return {
    response: result.response,
  };
}
