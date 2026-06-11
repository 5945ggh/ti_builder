import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type ResponseSource = "internal_member" | "external_tester";

export type AiScoringStatus =
  | "pending"
  | "scoring_open_answers"
  | "generating_debug_interpretation"
  | "completed"
  | "partially_failed"
  | "failed";

export type ExternalResultDetailLevel = "summary" | "detailed";

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  role: text("role").notNull().default("member"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
});

export const questionnaires = sqliteTable(
  "questionnaires",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    scenario: text("scenario").notNull().default(""),
    internalNote: text("internal_note").notNull().default(""),
    createdByMemberId: text("created_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    currentDraftSchema: text("current_draft_schema").notNull().default("{}"),
  },
  (table) => ({
    createdByMemberIdx: index("questionnaires_created_by_member_idx").on(table.createdByMemberId),
  }),
);

export const questionnaireVersions = sqliteTable(
  "questionnaire_versions",
  {
    id: text("id").primaryKey(),
    questionnaireId: text("questionnaire_id")
      .notNull()
      .references(() => questionnaires.id, { onDelete: "cascade", onUpdate: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    schemaSnapshot: text("schema_snapshot").notNull(),
    publishedByMemberId: text("published_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict", onUpdate: "cascade" }),
    publishNote: text("publish_note").notNull().default(""),
    testToken: text("test_token").notNull(),
    testTokenMaxResponses: integer("test_token_max_responses").notNull().default(50),
    testTokenResponseCount: integer("test_token_response_count").notNull().default(0),
    testTokenDisabledAt: integer("test_token_disabled_at", { mode: "timestamp_ms" }),
    externalResultDetailLevel: text("external_result_detail_level")
      .$type<ExternalResultDetailLevel>()
      .notNull()
      .default("summary"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    questionnaireVersionUniqueIdx: uniqueIndex("questionnaire_versions_questionnaire_version_unique").on(
      table.questionnaireId,
      table.versionNumber,
    ),
    testTokenUniqueIdx: uniqueIndex("questionnaire_versions_test_token_unique").on(table.testToken),
    questionnaireIdx: index("questionnaire_versions_questionnaire_idx").on(table.questionnaireId),
    publishedByMemberIdx: index("questionnaire_versions_published_by_member_idx").on(table.publishedByMemberId),
  }),
);

export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),
    questionnaireId: text("questionnaire_id")
      .notNull()
      .references(() => questionnaires.id, { onDelete: "cascade", onUpdate: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => questionnaireVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    resultToken: text("result_token").notNull(),
    respondentName: text("respondent_name").notNull(),
    respondentNote: text("respondent_note").notNull().default(""),
    memberId: text("member_id").references(() => members.id, { onDelete: "set null", onUpdate: "cascade" }),
    source: text("source").$type<ResponseSource>().notNull(),
    submitterKey: text("submitter_key").notNull(),
    clientSubmissionId: text("client_submission_id").notNull(),
    answers: text("answers").notNull(),
    perQuestionScores: text("per_question_scores"),
    finalVector: text("final_vector"),
    debugInterpretation: text("debug_interpretation"),
    aiScoringStatus: text("ai_scoring_status").$type<AiScoringStatus>().notNull().default("pending"),
    aiScoringError: text("ai_scoring_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    resultTokenUniqueIdx: uniqueIndex("responses_result_token_unique").on(table.resultToken),
    idempotencyUniqueIdx: uniqueIndex("responses_version_source_submitter_client_submission_unique").on(
      table.versionId,
      table.source,
      table.submitterKey,
      table.clientSubmissionId,
    ),
    questionnaireIdx: index("responses_questionnaire_idx").on(table.questionnaireId),
    versionIdx: index("responses_version_idx").on(table.versionId),
    memberIdx: index("responses_member_idx").on(table.memberId),
    submitterKeyIdx: index("responses_submitter_key_idx").on(table.submitterKey),
    scoringStatusIdx: index("responses_ai_scoring_status_idx").on(table.aiScoringStatus),
  }),
);

export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    responseId: text("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade", onUpdate: "cascade" }),
    interestScore: integer("interest_score").notNull(),
    accuracyScore: integer("accuracy_score").notNull(),
    shareWillingnessScore: integer("share_willingness_score").notNull(),
    usefulnessScore: integer("usefulness_score").notNull(),
    comment: text("comment").notNull().default(""),
    questionComments: text("question_comments"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    responseUniqueIdx: uniqueIndex("feedback_response_unique").on(table.responseId),
  }),
);

export const aiCallLogs = sqliteTable(
  "ai_call_logs",
  {
    id: text("id").primaryKey(),
    purpose: text("purpose").notNull(),
    responseId: text("response_id").references(() => responses.id, { onDelete: "set null", onUpdate: "cascade" }),
    questionId: text("question_id"),
    inputSummary: text("input_summary").notNull().default(""),
    output: text("output"),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    responseIdx: index("ai_call_logs_response_idx").on(table.responseId),
    purposeIdx: index("ai_call_logs_purpose_idx").on(table.purpose),
    statusIdx: index("ai_call_logs_status_idx").on(table.status),
  }),
);

export const membersRelations = relations(members, ({ many }) => ({
  questionnaires: many(questionnaires),
  publishedVersions: many(questionnaireVersions),
  responses: many(responses),
}));

export const questionnairesRelations = relations(questionnaires, ({ one, many }) => ({
  createdByMember: one(members, {
    fields: [questionnaires.createdByMemberId],
    references: [members.id],
  }),
  versions: many(questionnaireVersions),
  responses: many(responses),
}));

export const questionnaireVersionsRelations = relations(questionnaireVersions, ({ one, many }) => ({
  questionnaire: one(questionnaires, {
    fields: [questionnaireVersions.questionnaireId],
    references: [questionnaires.id],
  }),
  publishedByMember: one(members, {
    fields: [questionnaireVersions.publishedByMemberId],
    references: [members.id],
  }),
  responses: many(responses),
}));

export const responsesRelations = relations(responses, ({ one, many }) => ({
  questionnaire: one(questionnaires, {
    fields: [responses.questionnaireId],
    references: [questionnaires.id],
  }),
  version: one(questionnaireVersions, {
    fields: [responses.versionId],
    references: [questionnaireVersions.id],
  }),
  member: one(members, {
    fields: [responses.memberId],
    references: [members.id],
  }),
  feedback: many(feedback),
  aiCallLogs: many(aiCallLogs),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  response: one(responses, {
    fields: [feedback.responseId],
    references: [responses.id],
  }),
}));

export const aiCallLogsRelations = relations(aiCallLogs, ({ one }) => ({
  response: one(responses, {
    fields: [aiCallLogs.responseId],
    references: [responses.id],
  }),
}));
