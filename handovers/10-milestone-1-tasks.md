# Milestone 1 Tasks

Milestone 1 goal: a local questionnaire engine that supports members, questionnaire creation, schema editing, publishing, internal answering, choice-based additive scoring, and result vectors.

PRD acceptance anchors:

- Members can be created manually and selected in the admin UI.
- At least one example questionnaire runs end to end.
- Editing a draft after publish does not affect old version answering.
- Responses bind to immutable published versions by `versionId`.
- `QuestionnaireVersion.schemaSnapshot` cannot be modified after publish.

## M1-01 Database Schema, Migrations, Seed Data

Build the database foundation with Drizzle and SQLite.

Context:

- PRD sections 10, 12.1, 12.2, 13 M1.
- `handovers/00-architecture-and-contracts.md`.

Deliverables:

- Drizzle setup for SQLite.
- Tables for `Member`, `Questionnaire`, `QuestionnaireVersion`, `Response`, `Feedback`, and `AiCallLog`.
- Indexes/unique constraints for token lookup and idempotent response submission.
- Seed script with four manually inserted team members.
- Environment documentation for `DATABASE_URL`.

Suggested constraints:

- Use `nanoid(21)` for application IDs.
- Store JSON fields in SQLite text columns with typed helpers if needed.
- Add unique constraints for `QuestionnaireVersion.testToken`, `Response.resultToken`, and the idempotency tuple.
- Prefer explicit timestamp columns.

Acceptance:

- [ ] Migrations create all M1-needed tables.
- [ ] Seed script inserts four members without duplicating on rerun.
- [ ] `Response` includes `versionId`, `resultToken`, `clientSubmissionId`, and scoring fields.
- [ ] `QuestionnaireVersion` includes `schemaSnapshot`, token fields, and `externalResultDetailLevel`.
- [ ] No PostgreSQL/MySQL/Redis dependency is introduced.

Verification:

- Run migration on an empty local SQLite database.
- Run seed twice and verify no duplicate members.
- Inspect generated schema for token/idempotency uniqueness.

## M1-02 Password Login And Member Selection

Build the minimal admin access flow.

Context:

- PRD sections 5, 6.1, 11.1.

Deliverables:

- Shared-password login page.
- httpOnly signed session cookie.
- Middleware protection for `/admin/*` and `/api/admin/*`.
- Member picker after login.
- Member identity sent with admin writes for attribution.

Acceptance:

- [ ] Incorrect password does not create a session.
- [ ] Correct password creates a server-validated session.
- [ ] Unauthenticated users cannot access admin pages or APIs.
- [ ] Logged-in users can select a member.
- [ ] Selected member is used for created/published attribution.
- [ ] Member selection is not treated as authentication.

Verification:

- Manual browser flow: blocked admin page, failed login, successful login, member selection.
- API smoke checks for protected and unprotected endpoints.

## M1-03 Zod Questionnaire Schema And Validation Tests

Create the central questionnaire schema authority.

Context:

- PRD sections 8, 9.2.
- `handovers/00-architecture-and-contracts.md` schema contract.

Deliverables:

- `lib/schema/questionnaire.ts`.
- Exported zod schema and inferred TypeScript types.
- Validation helpers for questionnaire schemas and open-answer AI scoring output.
- Tests with one valid schema and at least five invalid schemas.

Acceptance:

- [ ] Supports dimensions, single choice, multiple choice, open text, and debug prompt.
- [ ] Rejects duplicate dimension IDs.
- [ ] Rejects duplicate question IDs.
- [ ] Rejects duplicate option IDs within a question.
- [ ] Rejects `deltaVector` keys that do not match dimensions.
- [ ] Allows missing or null `formula`, rejects non-null `formula`, and never executes formulas.
- [ ] Rejects open scoring output with unknown dimensions, out-of-range values, non-number values, or invalid confidence.

Verification:

- Run focused schema validation tests.
- Confirm no database or UI code depends on ad hoc schema parsing.

## M1-04 Questionnaire CRUD, Text Editor, Preview

Build the core admin questionnaire editing surface.

Context:

- PRD sections 7.1, 7.3, 11.2, 11.3.

Deliverables:

- Questionnaire list.
- Create questionnaire form.
- Edit base metadata.
- JSON schema text editor.
- Save draft.
- Real-time or near-real-time validation.
- Preview that reuses the answer-page rendering components in read-only mode where practical.

Acceptance:

- [ ] Admin can create a questionnaire with title, description, scenario, and internal note if modeled.
- [ ] Admin can edit and save `currentDraftSchema`.
- [ ] Invalid schema shows useful validation errors.
- [ ] Preview displays title, description, dimensions, questions, options, vector contributions, and open-question prompt summary.
- [ ] No drag-and-drop editor is introduced.

Verification:

- Manual flow with valid and invalid JSON.
- Confirm preview and answer UI share rendering components or a documented common component boundary.

## M1-05 Publish Version And Immutability

Publish draft schemas into immutable versions.

Context:

- PRD sections 7.4, 10.3, 15.4.

Deliverables:

- Publish action from questionnaire edit page.
- Publish note input.
- Schema validation before publish.
- Incrementing version number.
- Immutable `schemaSnapshot`.
- Generated `testToken`.
- Version list with core metadata.

Acceptance:

- [ ] Only valid draft schemas can be published.
- [ ] Each publish creates a new `QuestionnaireVersion`.
- [ ] Version numbers increment per questionnaire.
- [ ] Publish records `publishedByMemberId`.
- [ ] Editing `currentDraftSchema` after publish does not mutate any old version.
- [ ] Application code rejects attempts to update immutable version fields.

Verification:

- Publish, edit draft, answer old version, and verify old schema is still used.
- Add a targeted test or guard around immutable update behavior if feasible.

## M1-06 Answer Page And Idempotent Submit API

Build internal answering for published versions and idempotent submission.

Context:

- PRD sections 7.6, 11.5.

Deliverables:

- Answer page for a published version.
- Respondent name and note form.
- Linear rendering for supported question types.
- Client-generated `clientSubmissionId`.
- Submit API with zod validation.
- Idempotency tuple for duplicate submit retries.
- Synchronous choice scoring placeholder or integration with M1-07.

Acceptance:

- [ ] Only published versions can be formally answered.
- [ ] Single choice, multiple choice, and open text answers are accepted in the data shape.
- [ ] Duplicate submissions with the same version/source/member-or-token/clientSubmissionId return the same response.
- [ ] Network retry or refresh does not create duplicate responses.
- [ ] Submit response includes `responseId` or result token plus initial scoring status.

Verification:

- Manual submit and duplicate submit.
- API-level test for idempotent behavior if a test harness exists.

## M1-07 Scoring Engine And Choice-Only Result Page

Build the pure scoring engine and a first result page for questionnaires without open-answer AI scoring.

Context:

- PRD sections 8.3, 8.4, 7.7, 13 M1.

Deliverables:

- `lib/scoring/engine.ts`.
- Unit tests for single choice, multiple choice, missing answers, unknown option handling, and theoretical range derivation.
- Result page showing final vector, dimensions, top/bottom features, and per-question contribution for internal users.

Acceptance:

- [ ] Choice deltas sum into the final vector correctly.
- [ ] Multiple choice sums all selected option deltas.
- [ ] `formula` is never executed.
- [ ] Theoretical min/max ranges follow PRD 8.4.
- [ ] Raw score is shown even when normalization cannot be derived.
- [ ] Result page reads the immutable published schema via `versionId`.

Verification:

- Run scoring unit tests.
- Complete one choice-only questionnaire end to end and inspect the result vector.
