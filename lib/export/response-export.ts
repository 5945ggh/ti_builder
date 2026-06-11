import { asc, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { aiCallLogs, feedback, members, questionnaireVersions, questionnaires, responses } from "../db/schema.ts";

type JsonObject = Record<string, unknown>;

export type ResponseJsonExport =
  | {
      ok: true;
      export: JsonObject;
    }
  | {
      ok: false;
      error: "not_found" | "invalid_json";
    };

function parseJson(input: string | null): unknown {
  if (input === null) {
    return null;
  }

  return JSON.parse(input);
}

function toIsoString(value: Date) {
  return value.toISOString();
}

export function buildResponseJsonExport(db: AppDb, responseId: string, options: { exportedAt?: Date } = {}): ResponseJsonExport {
  const row = db
    .select({
      responseId: responses.id,
      questionnaireId: responses.questionnaireId,
      versionId: responses.versionId,
      respondentName: responses.respondentName,
      respondentNote: responses.respondentNote,
      memberId: responses.memberId,
      source: responses.source,
      answers: responses.answers,
      perQuestionScores: responses.perQuestionScores,
      finalVector: responses.finalVector,
      debugInterpretation: responses.debugInterpretation,
      aiScoringStatus: responses.aiScoringStatus,
      aiScoringError: responses.aiScoringError,
      responseCreatedAt: responses.createdAt,
      questionnaireTitle: questionnaires.title,
      questionnaireDescription: questionnaires.description,
      questionnaireScenario: questionnaires.scenario,
      versionNumber: questionnaireVersions.versionNumber,
      schemaSnapshot: questionnaireVersions.schemaSnapshot,
      publishNote: questionnaireVersions.publishNote,
      publishedByMemberId: questionnaireVersions.publishedByMemberId,
      versionCreatedAt: questionnaireVersions.createdAt,
      externalResultDetailLevel: questionnaireVersions.externalResultDetailLevel,
      memberName: members.name,
    })
    .from(responses)
    .innerJoin(questionnaireVersions, eq(responses.versionId, questionnaireVersions.id))
    .innerJoin(questionnaires, eq(responses.questionnaireId, questionnaires.id))
    .leftJoin(members, eq(responses.memberId, members.id))
    .where(eq(responses.id, responseId))
    .get();

  if (!row) {
    return {
      ok: false,
      error: "not_found",
    };
  }

  const feedbackRow = db
    .select({
      id: feedback.id,
      interestScore: feedback.interestScore,
      accuracyScore: feedback.accuracyScore,
      shareWillingnessScore: feedback.shareWillingnessScore,
      usefulnessScore: feedback.usefulnessScore,
      comment: feedback.comment,
      questionComments: feedback.questionComments,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .where(eq(feedback.responseId, row.responseId))
    .get();

  const aiLogs = db
    .select({
      id: aiCallLogs.id,
      purpose: aiCallLogs.purpose,
      responseId: aiCallLogs.responseId,
      questionId: aiCallLogs.questionId,
      inputSummary: aiCallLogs.inputSummary,
      output: aiCallLogs.output,
      status: aiCallLogs.status,
      error: aiCallLogs.error,
      createdAt: aiCallLogs.createdAt,
    })
    .from(aiCallLogs)
    .where(eq(aiCallLogs.responseId, row.responseId))
    .orderBy(asc(aiCallLogs.createdAt), asc(aiCallLogs.id))
    .all();

  try {
    return {
      ok: true,
      export: {
        exportedAt: toIsoString(options.exportedAt ?? new Date()),
        response: {
          id: row.responseId,
          questionnaireId: row.questionnaireId,
          versionId: row.versionId,
          respondentName: row.respondentName,
          respondentNote: row.respondentNote,
          memberId: row.memberId,
          memberName: row.memberName,
          source: row.source,
          createdAt: toIsoString(row.responseCreatedAt),
        },
        questionnaire: {
          id: row.questionnaireId,
          title: row.questionnaireTitle,
          description: row.questionnaireDescription,
          scenario: row.questionnaireScenario,
        },
        questionnaireVersion: {
          id: row.versionId,
          questionnaireId: row.questionnaireId,
          versionNumber: row.versionNumber,
          publishNote: row.publishNote,
          publishedByMemberId: row.publishedByMemberId,
          externalResultDetailLevel: row.externalResultDetailLevel,
          createdAt: toIsoString(row.versionCreatedAt),
          schemaSnapshot: parseJson(row.schemaSnapshot),
        },
        interpretationData: {
          answers: parseJson(row.answers),
          perQuestionScores: parseJson(row.perQuestionScores),
          finalVector: parseJson(row.finalVector),
          debugInterpretation: row.debugInterpretation,
          aiScoringStatus: row.aiScoringStatus,
          aiScoringError: row.aiScoringError,
          aiCallLogs: aiLogs.map((log) => ({
            id: log.id,
            purpose: log.purpose,
            responseId: log.responseId,
            questionId: log.questionId,
            inputSummary: log.inputSummary,
            output: log.output,
            status: log.status,
            error: log.error,
            createdAt: toIsoString(log.createdAt),
          })),
        },
        feedback: feedbackRow
          ? {
              id: feedbackRow.id,
              responseId: row.responseId,
              interestScore: feedbackRow.interestScore,
              accuracyScore: feedbackRow.accuracyScore,
              shareWillingnessScore: feedbackRow.shareWillingnessScore,
              usefulnessScore: feedbackRow.usefulnessScore,
              comment: feedbackRow.comment,
              questionComments: parseJson(feedbackRow.questionComments),
              createdAt: toIsoString(feedbackRow.createdAt),
            }
          : null,
      },
    };
  } catch {
    return {
      ok: false,
      error: "invalid_json",
    };
  }
}
