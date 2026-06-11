# Architecture And Contracts

This document turns the PRD into implementation contracts. Use it as the first handover context for every coding session.

## Product Boundary

The product is an internal test production and validation workbench, not a public consumer testing platform.

Build for:

- Fast creation and iteration of multiple questionnaires.
- Immutable published versions.
- Internal and small external test responses.
- Stable additive result vectors.
- AI-assisted schema generation, open-answer scoring, and internal debug interpretation.
- Exportable data for later discussion and analysis.

Do not optimize v1 for:

- Public registration or account recovery.
- A polished viral result page.
- Posters, sharing images, or social publishing automation.
- Dynamic AI follow-up questions.
- Branching question flows.
- Formula engines, scripts, or arbitrary user-defined scoring code.
- Psychometric validity or deterministic school/career advice.

## Route Contract

Use these route families:

- Admin UI: `/admin/...`
- Internal/admin APIs: `/api/admin/...`
- Public answer page: `/t/[testToken]`
- Public result page: `/r/[resultToken]`
- Public APIs: `/api/public/...`

Admin routes are protected by a shared password session. Public routes are protected only by random tokens and must return data only for the addressed token.

## Authentication Contract

v1 has one shared admin password configured by `ADMIN_ACCESS_PASSWORD`.

After successful password verification:

- Issue an httpOnly signed cookie.
- Middleware protects `/admin/*` and `/api/admin/*`.
- Member identity is selected after login and is used for attribution only.
- Member identity is not a security boundary.

`iron-session` is acceptable for the signed cookie implementation.

## Data Model Contract

Use `nanoid(21)` IDs for application entities unless a local framework constraint makes this impractical.

Core entities:

- `Member`: internal actor for attribution.
- `Questionnaire`: mutable draft owner.
- `QuestionnaireVersion`: immutable published snapshot and test token holder.
- `Response`: submitted answers and scoring state.
- `Feedback`: response-level feedback.
- `AiCallLog`: AI request/response/error audit trail.

Important invariants:

- A `Questionnaire` owns the mutable `currentDraftSchema`.
- A `QuestionnaireVersion` owns the immutable `schemaSnapshot`.
- A `Response` stores `versionId`, not a copied schema snapshot.
- A published version's `schemaSnapshot`, `versionNumber`, `questionnaireId`, `publishedByMemberId`, and `createdAt` must not change.
- `resultToken` is required for result-page access.
- `clientSubmissionId` is required for idempotent submit behavior.

## Questionnaire Schema Contract

Create `lib/schema/questionnaire.ts` early and treat it as the schema source of truth.

It should export:

- The zod questionnaire schema.
- The inferred TypeScript type.
- The zod AI open-answer scoring output schema or a factory that validates against a questionnaire's dimensions and score ranges.
- Helper validators for publish-time and AI-output validation.

The questionnaire schema must support:

- `title`
- `description`
- `scenario`
- `dimensions`
- `questions`
- `resultDebugPrompt`
- `single_choice`
- `multiple_choice`
- `open_text`
- choice option `deltaVector`
- open question `scoringPrompt`
- open question `scoreRange`

Validation requirements:

- Dimension IDs are unique.
- Question IDs are unique.
- Option IDs are unique within each choice question.
- Every `deltaVector` key references a defined dimension.
- Choice option `formula` is absent or `null`; reject non-null values and never execute them.
- Open scoring output contains only known dimensions.
- Open scoring values are numbers inside the question's `scoreRange`.
- Open scoring `confidence` is between 0 and 1.

## Scoring Contract

Create `lib/scoring/engine.ts` as a pure function module.

Input:

- Published `schemaSnapshot`.
- User answers.
- AI deltas for open-text questions.

Output:

- Per-question scores.
- Final additive vector.
- Theoretical min/max ranges per dimension where derivable.
- Normalized display values only when the range is derivable.

The scoring engine must not:

- Read or write the database.
- Call AI.
- Depend on request/session state.
- Execute `formula`.

This module deserves focused unit tests.

## AI Contract

Create `lib/ai/client.ts` as server-only code.

Requirements:

- Read `AI_API_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` from the server environment.
- Apply a 60 second timeout per call.
- Retry failed AI calls once when safe.
- Log all calls to `AiCallLog`.
- Strip possible markdown code fences before JSON parsing.
- Validate parsed JSON with zod.
- Never expose the API key to the browser.

AI features:

- Generate schema drafts from source text.
- Score open-text answers.
- Generate internal debug interpretation.
- Test AI connection from the settings page.

AI must not:

- Automatically publish questionnaires.
- Automatically overwrite existing drafts.
- Decide question flow during answering.
- Produce deterministic school/career recommendations.

## Async Scoring Contract

Use the database as the queue for v1.

Required statuses:

- `pending`
- `scoring_open_answers`
- `generating_debug_interpretation`
- `completed`
- `partially_failed`
- `failed`

Implementation direction:

- The submit API validates and stores answers, sets `aiScoringStatus = pending`, computes any synchronous choice scores, and returns within 2 seconds.
- A singleton in-process worker starts from `instrumentation.ts` and scans pending responses every 2-3 seconds.
- The worker marks a response as claimed before scoring to avoid duplicate work.
- Open answers for one response are scored with `Promise.allSettled`.
- After open-answer scoring, recompute the final vector and generate debug interpretation.
- On process restart, unfinished records remain visible by persisted status and can be resumed or manually rescored.

Do not add Redis or an external queue for v1.

## Deployment Contract

Target deployment:

- Aliyun ECS, 2 core / 2GB RAM.
- Next standalone server behind Caddy.
- pm2 process supervision.
- SQLite database with daily online backups.

Environment variables:

- `ADMIN_ACCESS_PASSWORD`
- `AI_API_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `DATABASE_URL`

Minimum backup policy:

- Daily SQLite `.backup`.
- Keep at least the latest 7 backups.
- Store backups outside the app directory.
- Validate restore before collecting meaningful external test data.
