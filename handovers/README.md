# Handovers

This directory is the working contract for agent-to-agent implementation handovers.
Each task should be small enough for one focused coding session and one commit.

## Source Of Truth

- Product source: `docs/prd-test-workbench.md`.
- Questionnaire schema source: `lib/schema/questionnaire.ts` once created.
- Scoring source: `lib/scoring/engine.ts` once created.
- Published questionnaire versions are immutable product records.

If a task conflicts with the PRD, prefer the PRD unless this directory explicitly records a later decision.

## Fixed Architecture

Use this stack unless the project owner explicitly changes it:

- Next.js App Router with `output: 'standalone'` for self-hosting.
- SQLite for v1 data storage.
- Drizzle ORM for database schema and migrations.
- zod as the schema and validation authority.
- Caddy reverse proxy.
- pm2 process management.

Rationale:

- The target machine is a 2 core / 2GB RAM Aliyun ECS, so the architecture must stay small.
- Drizzle avoids a separate Prisma engine process and keeps migrations transparent.
- zod gives agents a concrete executable contract for questionnaire schemas, AI outputs, API inputs, and publish-time validation.
- SQLite keeps deployment and backup simple during the internal validation phase.

## Non-Negotiable Constraints

- AI API keys are server-only.
- All write APIs validate input with zod before touching the database.
- Published version snapshots are append-only. Do not update a published `schemaSnapshot`.
- `Response` records reference immutable `QuestionnaireVersion` rows by `versionId`; do not duplicate `schemaSnapshot` into `Response`.
- External access is token-based and must not expose other users' data.
- External result pages use `resultToken`, never sequential IDs.
- `testToken` and `resultToken` must be random and non-enumerable. Use `nanoid(21)` unless a task states otherwise.
- Do not introduce Redis, PostgreSQL, MySQL, BullMQ, queues, or extra infrastructure for v1.
- Do not build a drag-and-drop editor.
- Do not execute user-authored formulas or scripts.
- Do not let AI automatically publish or overwrite drafts. Human confirmation is required.

## Session Discipline

One feature equals one agent session equals one commit.

Every implementation session should receive:

- The relevant PRD sections.
- `handovers/00-architecture-and-contracts.md`.
- `handovers/session-template.md`.
- The specific milestone task file.
- `lib/schema/questionnaire.ts` after it exists.
- A concrete acceptance checklist copied from the task.

Before editing, the agent should inspect current files and confirm the existing patterns. After editing, it should run the smallest useful verification: targeted unit tests for pure logic, typecheck/lint/build when available, and manual acceptance notes for UI flows.

## Task Order

Recommended implementation order:

1. M1 database schema, migrations, and seed data.
2. M1 password login and member selection.
3. M1 zod questionnaire schema and validation tests.
4. M1 questionnaire CRUD, schema text editor, and preview.
5. M1 publish version and immutability guardrails.
6. M1 answer flow and idempotent submit API.
7. M1 scoring engine and result page for choice-only questionnaires.
8. M2 AI client and connection self-test.
9. M2 AI schema draft generation.
10. M2 async scoring worker and polling.
11. M2 debug interpretation.
12. M2 single-response rescoring.
13. M2 feedback form.
14. M2 JSON export.
15. M3 external token flow, detail-level rendering, local progress recovery, version diff, data filters, and CSV export.

Deploy and manually click through the app after each milestone. Internal team members are the primary QA surface for v1.

## Done Definition

A handover task is done only when:

- Its acceptance checklist passes.
- The changed files match the task scope.
- No forbidden dependency or scope expansion was introduced.
- Relevant tests or manual verification evidence is recorded in the final response.
- Any known gaps are explicitly named.
