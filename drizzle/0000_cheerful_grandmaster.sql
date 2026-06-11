CREATE TABLE `ai_call_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`response_id` text,
	`question_id` text,
	`input_summary` text DEFAULT '' NOT NULL,
	`output` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `responses`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_call_logs_response_idx` ON `ai_call_logs` (`response_id`);--> statement-breakpoint
CREATE INDEX `ai_call_logs_purpose_idx` ON `ai_call_logs` (`purpose`);--> statement-breakpoint
CREATE INDEX `ai_call_logs_status_idx` ON `ai_call_logs` (`status`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`interest_score` integer NOT NULL,
	`accuracy_score` integer NOT NULL,
	`share_willingness_score` integer NOT NULL,
	`usefulness_score` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`question_comments` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `responses`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_response_unique` ON `feedback` (`response_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_name_unique` ON `members` (`name`);--> statement-breakpoint
CREATE TABLE `questionnaire_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`questionnaire_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`schema_snapshot` text NOT NULL,
	`published_by_member_id` text NOT NULL,
	`publish_note` text DEFAULT '' NOT NULL,
	`test_token` text NOT NULL,
	`test_token_max_responses` integer DEFAULT 50 NOT NULL,
	`test_token_response_count` integer DEFAULT 0 NOT NULL,
	`test_token_disabled_at` integer,
	`external_result_detail_level` text DEFAULT 'summary' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`questionnaire_id`) REFERENCES `questionnaires`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`published_by_member_id`) REFERENCES `members`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questionnaire_versions_questionnaire_version_unique` ON `questionnaire_versions` (`questionnaire_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `questionnaire_versions_test_token_unique` ON `questionnaire_versions` (`test_token`);--> statement-breakpoint
CREATE INDEX `questionnaire_versions_questionnaire_idx` ON `questionnaire_versions` (`questionnaire_id`);--> statement-breakpoint
CREATE INDEX `questionnaire_versions_published_by_member_idx` ON `questionnaire_versions` (`published_by_member_id`);--> statement-breakpoint
CREATE TABLE `questionnaires` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`scenario` text DEFAULT '' NOT NULL,
	`created_by_member_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`current_draft_schema` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `members`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `questionnaires_created_by_member_idx` ON `questionnaires` (`created_by_member_id`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`questionnaire_id` text NOT NULL,
	`version_id` text NOT NULL,
	`result_token` text NOT NULL,
	`respondent_name` text NOT NULL,
	`respondent_note` text DEFAULT '' NOT NULL,
	`member_id` text,
	`source` text NOT NULL,
	`submitter_key` text NOT NULL,
	`client_submission_id` text NOT NULL,
	`answers` text NOT NULL,
	`per_question_scores` text,
	`final_vector` text,
	`debug_interpretation` text,
	`ai_scoring_status` text DEFAULT 'pending' NOT NULL,
	`ai_scoring_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`questionnaire_id`) REFERENCES `questionnaires`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `questionnaire_versions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `responses_result_token_unique` ON `responses` (`result_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `responses_version_source_submitter_client_submission_unique` ON `responses` (`version_id`,`source`,`submitter_key`,`client_submission_id`);--> statement-breakpoint
CREATE INDEX `responses_questionnaire_idx` ON `responses` (`questionnaire_id`);--> statement-breakpoint
CREATE INDEX `responses_version_idx` ON `responses` (`version_id`);--> statement-breakpoint
CREATE INDEX `responses_member_idx` ON `responses` (`member_id`);--> statement-breakpoint
CREATE INDEX `responses_submitter_key_idx` ON `responses` (`submitter_key`);--> statement-breakpoint
CREATE INDEX `responses_ai_scoring_status_idx` ON `responses` (`ai_scoring_status`);