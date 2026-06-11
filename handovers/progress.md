# Progress

This file records delivery-lead task state, verification evidence, risks, and next steps.

## Repository Recon

- Date: 2026-06-11
- Actual state: empty Git repository on `main` with no commits.
- Existing files: `.gitignore`, `.omx/`, `docs/`, `handovers/`.
- Missing app files: `package.json`, Next.js config, TypeScript config, source app, database config, tests.
- Package manager: none detected.
- Available scripts: none detected.
- Deeper `AGENTS.md`: none detected under the repository.

## Task Log

### BOOT-01 Minimal Next.js Workbench Foundation

- Status: completed
- Reason: `docs/goal.md` says to initialize a minimal production-direction foundation when the project is not yet a Next.js app.
- Scope: create the minimal Next.js App Router + TypeScript + SQLite/Drizzle/zod project foundation needed before M1-01.
- Worker: pending
- Reviewer: pending
- Verification evidence: pending
- Risks: dependency installation may require network access; no existing project conventions to inherit.
- Next step: dispatch implementation Worker.

#### Worker Result - BOOT-01

- Worker: BOOT-01 implementation worker
- Status: completed
- Files added/updated: `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `drizzle.config.ts`, `app/`, `lib/env.ts`, `lib/db/`, `.env.example`, `.gitignore`, `README.md`.
- Summary: created a minimal npm-based Next.js App Router foundation with TypeScript, `output: 'standalone'`, zod server env validation, Drizzle SQLite connection placeholder, and internal workbench/admin empty-state pages.
- Verification evidence: `npm install` succeeded; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed.
- Scope note: no M1-01 business tables, seed data, login flow, AI implementation, or questionnaire schema implemented.
- Risk note: `npm install` reported 7 audit findings in transitive dependencies; no audit remediation was applied because BOOT-01 only required foundation initialization and the suggested force fix may introduce breaking changes.

#### Lead Fix Loop - BOOT-01

- Issue found: lead reran `npm run lint` after build and ESLint scanned `.next/` plus ignored `next-env.d.ts`, causing generated-file lint failures.
- Fix applied: updated `eslint.config.mjs` to ignore `.next/**`, `node_modules/**`, and `next-env.d.ts`; removed `next-env.d.ts` from `.gitignore` so the standard Next type entry can be committed.
- Verification evidence after fix: `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed.
- Reviewer: `code-reviewer` returned `APPROVED_WITH_NOTES`.
- Reviewer note: default `DATABASE_URL` uses `file:./data/workbench.sqlite`; M1-01 should ensure the data directory exists before migrations/seeding or otherwise make the SQLite path robust on clean checkout.
- Lead disposition: BOOT-01 accepted; carry the SQLite directory note into M1-01.

### M1-01 Database Schema, Migrations, Seed Data

- Status: completed
- Reason: first Milestone 1 handover task after BOOT-01 foundation.
- Scope: Drizzle SQLite schema, migrations, indexes/unique constraints, four-member seed script, and `DATABASE_URL` docs.
- Worker: pending
- Reviewer: independent `code-reviewer` approved after fix loop
- Verification evidence: pending
- Risks: local ignored `data/workbench.sqlite` may exist from review smoke checks; verification should use a clean temporary SQLite database or recreate local state intentionally.
- Next step: dispatch implementation Worker.

#### Worker Result - M1-01

- Worker: M1-01 implementation worker
- Status: completed
- Files added/updated: `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle/0000_large_gambit.sql`, `drizzle/meta/`, `scripts/migrate.mjs`, `scripts/seed.mjs`, `scripts/sqlite-path.mjs`, `data/.gitkeep`, `package.json`, `.gitignore`, `.env.example`, `README.md`, `handovers/progress.md`.
- Summary: replaced the migration probe with M1 core tables (`Member`, `Questionnaire`, `QuestionnaireVersion`, `Response`, `Feedback`, `AiCallLog`), SQLite text IDs, integer millisecond timestamps, JSON-as-text fields, token uniqueness, response idempotency uniqueness, parent-directory creation for SQLite files, and idempotent four-member seed data.
- Verification evidence: `DATABASE_URL=file:./data/m1-01-verify.sqlite npm run db:migrate` passed on an empty SQLite DB; `DATABASE_URL=file:./data/m1-01-verify.sqlite npm run db:seed` run twice and reported 4 members both times; direct SQLite query confirmed 4 members and unique indexes for `questionnaire_versions.test_token`, `responses.result_token`, and `responses.version/source/member/client_submission`; `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Scope note: no login, questionnaire zod schema, UI, answer flow, scoring engine, AI client, Redis/PostgreSQL/MySQL, or extra infrastructure was added.
- Risk note: lead review found the initial DB-level idempotency index used nullable `memberId`, which would not cover external tester retries under SQLite `NULL` uniqueness semantics. Lead fix loop added non-null `responses.submitterKey` and changed the idempotency unique index to `versionId + source + submitterKey + clientSubmissionId`; M1-06 must populate `submitterKey` with selected member ID for internal submissions and the addressed test token or equivalent stable external scope for external submissions.

#### Lead Fix Loop - M1-01

- Issue found: initial idempotency unique index used nullable `memberId`, so SQLite could allow duplicate external submissions with the same `clientSubmissionId`.
- Fix applied: added non-null `responses.submitterKey`, changed idempotency uniqueness to `versionId + source + submitterKey + clientSubmissionId`, added `responses_submitter_key_idx`, regenerated the initial migration as `drizzle/0000_cheerful_grandmaster.sql`, and updated README/progress notes.
- Verification evidence after fix: `npm run db:generate` passed; `DATABASE_URL=file:./data/m1-01-lead-verify.sqlite npm run db:migrate` passed on an empty DB; `DATABASE_URL=file:./data/m1-01-lead-verify.sqlite npm run db:seed` passed twice with 4 members; direct SQLite inspection confirmed all six business tables, `responses.submitter_key`, `questionnaire_versions_test_token_unique`, `responses_result_token_unique`, and `responses_version_source_submitter_client_submission_unique`; `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Reviewer: `code-reviewer` returned `APPROVED_WITH_NOTES`.
- Reviewer notes: `submitterKey` is justified and should be populated exactly in M1-06; enum-like text fields remain application/zod validated; immutable version update guards remain for M1-05.
- Lead disposition: M1-01 accepted and commit-ready.

### M1-02 Password Login And Member Selection

- Status: completed
- Reason: next Milestone 1 handover task after database foundation.
- Scope: shared-password admin login, httpOnly signed session cookie, middleware protection for `/admin/*` and `/api/admin/*`, member picker, and member identity plumbing for later admin attribution.
- Worker: pending
- Reviewer: pending
- Verification evidence: pending
- Risks: no existing auth/session library yet; `iron-session` is explicitly acceptable by architecture contract but is a new dependency.
- Next step: dispatch implementation Worker.

#### Worker Result - M1-02

- Worker: M1-02 implementation worker
- Status: completed
- Files added/updated: `middleware.ts`, `lib/session/admin-session-core.ts`, `lib/session/admin-session.ts`, `lib/auth/admin.ts`, `app/login/`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/admin/session/route.ts`, `app/api/admin/session/member/route.ts`, `app/admin/page.tsx`, `app/admin/member-picker.tsx`, `app/globals.css`, `lib/env.ts`, `.env.example`, `README.md`, `handovers/progress.md`.
- Summary: implemented shared-password admin login using `ADMIN_ACCESS_PASSWORD`, HMAC-signed httpOnly `ti_admin_session` cookie using `SESSION_SECRET`, middleware protection for `/admin/*` and `/api/admin/*`, DB-backed member picker, selected member session storage, and `requireSelectedAdminMember()` for later attribution writes.
- Verification evidence from Worker: `npm run typecheck`, `npm run lint`, `npm run build` passed; `DATABASE_URL=file:./data/m1-02-smoke.sqlite npm run db:migrate` and `npm run db:seed` passed; local smoke covered unauthenticated redirects/401s, wrong password, successful login with `Set-Cookie`, member selection, selected session readback, and unauthenticated member selection rejection.
- Scope note: no questionnaire schema, CRUD, publish, answer, scoring, AI, DB schema, or dependency changes were introduced.
- Risk note: later M1 write APIs must call `requireSelectedAdminMember()` or equivalent before writes requiring attribution; deployment must provide a 32+ character `SESSION_SECRET`.

#### Lead Verification - M1-02

- Static verification: `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed.
- Smoke setup: `DATABASE_URL=file:./data/m1-02-smoke.sqlite npm run db:migrate` passed; `DATABASE_URL=file:./data/m1-02-smoke.sqlite npm run db:seed` passed with 4 members.
- Smoke result: with `ADMIN_ACCESS_PASSWORD=correct-password`, `SESSION_SECRET=abcdefghijklmnopqrstuvwxyz123456`, and `DATABASE_URL=file:./data/m1-02-smoke.sqlite`, `GET /admin` unauthenticated returned `307` to `/login?next=%2Fadmin`; `GET /api/admin/session` unauthenticated returned `401`; wrong password returned `401` and no `ti_admin_session`; correct password returned `200` with httpOnly `ti_admin_session`; member selection for `member_team_001` returned `200` and refreshed the signed session; session readback returned selected member; member selection without auth returned `401`.
- Reviewer: `code-reviewer` returned `APPROVED_WITH_NOTES`.
- Reviewer note: `/api/admin/session` readback initially resolved selected member without filtering `archivedAt IS NULL`; selection and attribution helper already filtered active members.
- Lead fix loop: updated `app/api/admin/session/route.ts` to filter `isNull(members.archivedAt)` for selected-member readback, aligning it with selection and `requireSelectedAdminMember()`.
- Verification evidence after fix: `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Lead disposition: M1-02 accepted and commit-ready.

### M1-03 Zod Questionnaire Schema And Validation Tests

- Status: completed
- Reason: next Milestone 1 handover task after admin auth/member selection.
- Scope: central questionnaire zod schema authority, open-answer scoring output validation helper, and focused validation tests.
- Worker: pending
- Reviewer: pending
- Verification evidence: pending
- Risks: no test runner exists yet; adding a minimal Node test setup is likely required.
- Next step: dispatch implementation Worker.

#### Worker Result - M1-03

- Worker: M1-03 implementation worker
- Status: completed
- Files added/updated: `lib/schema/questionnaire.ts`, `lib/schema/questionnaire.test.mjs`, `package.json`, `README.md`, `handovers/progress.md`.
- Summary: added the central zod questionnaire schema authority with inferred TypeScript types, parse/safe-parse helpers, choice/open question schemas, duplicate ID checks, deltaVector dimension validation, formula restricted to missing/null only, and dynamic open-answer AI scoring output validation against a parsed questionnaire and open question score range.
- Test coverage: includes one valid mixed schema plus invalid cases for duplicate dimension IDs, duplicate question IDs, duplicate option IDs, unknown deltaVector dimensions, non-null formula, unknown open scoring dimensions, out-of-range open scoring values, non-number open scoring values, and invalid confidence.
- Verification evidence: `npm run test:schema` passed 12/12 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed.
- Scope note: no CRUD/UI, publish flow, answer flow, scoring engine, AI client, DB schema, forbidden dependencies, or extra infrastructure was added.
- Risk note: `npm run test:schema` uses Node's built-in TypeScript type stripping on Node v24 and emits a non-failing `MODULE_TYPELESS_PACKAGE_JSON` warning because the project package is not marked `"type": "module"`; no package module-mode change was made to avoid broadening scope.

#### Lead Verification - M1-03

- Static/focused verification: `npm run test:schema` passed 12/12 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed.
- Test warning: `npm run test:schema` emits Node's non-failing `MODULE_TYPELESS_PACKAGE_JSON` warning when importing the TypeScript source from the `.mjs` test; no behavior failure observed.
- Reviewer: `code-reviewer` returned `APPROVED_WITH_NOTES`.
- Reviewer notes: no blocking findings; Node test warning is acceptable for M1-03 because avoiding it would broaden package module semantics or add extra test/build plumbing.
- Lead disposition: M1-03 accepted and commit-ready.

### M1-04 Questionnaire CRUD, Text Editor, Preview

- Status: completed
- Reason: next Milestone 1 handover task after schema authority.
- Scope: questionnaire list, create form, metadata edit, JSON schema text editor, save draft, validation feedback, and read-only preview.
- Worker: pending
- Reviewer: pending
- Verification evidence: pending
- Risks: first substantial admin UI/data-write task; must reuse auth/member attribution and zod schema without introducing drag-and-drop editor.
- Next step: dispatch implementation Worker.

#### Worker Result - M1-04

- Worker: M1-04 implementation worker
- Status: implementation complete
- Files added/updated: `app/admin/page.tsx`, `app/admin/questionnaires/`, `components/questionnaire/questionnaire-preview.tsx`, `lib/questionnaires/draft.ts`, `app/globals.css`, `README.md`, `handovers/progress.md`.
- Summary: added questionnaire list, create page, edit page, zod-validated server actions, minimal valid initial draft generation, JSON draft text editor, near-real-time client validation, save-draft validation guard, and shared read-only questionnaire preview for dimensions, questions, options, vector deltas, and open-question prompt summaries.
- Scope note: no publish action, answer submit flow, scoring engine/result page, AI, drag-and-drop editor, DB schema change, or new dependency was introduced. Internal note is shown as unavailable because the current DB schema has no modeled field.
- Verification evidence: `npm run test:schema` passed 12/12 tests with the known non-failing Node module-type warning; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed. SQLite smoke with `DATABASE_URL=file:./data/m1-04-smoke.sqlite` migrated and seeded a clean DB, inserted a questionnaire draft with a `nanoid(21)` ID and `member_team_001` attribution, rejected an invalid schema object, saved a valid updated draft, and re-read a row containing 2 dimensions, 2 questions, and an open-text scoring prompt. In-app Browser reached `/admin/questionnaires` and confirmed unauthenticated redirect to `/login?next=%2Fadmin%2Fquestionnaires`.
- Risk note: full browser form submission after login was not completed because shell curl could not connect to the elevated dev-server listener and Browser login did not establish a usable signed session in this environment. Manual path remains `/login -> /admin -> select member -> /admin/questionnaires/new -> create -> /admin/questionnaires/[id] -> edit JSON -> save`.

#### Lead Verification - M1-04

- Lead: Delivery Lead
- Status: completed
- Static verification: `npm run test:schema` passed 12/12 tests with the known non-failing Node module-type warning; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and showed `/admin/questionnaires`, `/admin/questionnaires/new`, and `/admin/questionnaires/[id]` routes.
- Authenticated smoke: with local dev server on `127.0.0.1:3014`, `ADMIN_ACCESS_PASSWORD=correct-password`, `SESSION_SECRET=abcdefghijklmnopqrstuvwxyz123456`, and `DATABASE_URL=file:./data/m1-04-smoke.sqlite`, curl login/member-selection succeeded. With the signed cookie, `GET /admin/questionnaires` returned `200` and rendered the selected member plus the smoke questionnaire list; `GET /admin/questionnaires/new` returned `200` and rendered the create form attributed to `团队成员 1`; `GET /admin/questionnaires/JCGwqpz8adYY7u3Lx9fD_` returned `200` and rendered the JSON editor plus read-only preview with 2 dimensions and 2 questions.
- Lead fix loop: synchronized the saved draft JSON top-level `title`, `description`, and `scenario` from the metadata form before writing `currentDraftSchema`, preventing the list/edit metadata and preview/publish-source metadata from drifting after save.
- Reviewer: independent `code-reviewer` returned `APPROVED_WITH_NOTES` with no critical/high/medium findings. Low notes were starter draft re-validation before insert and lack of independently repeated full browser authenticated form submission.
- Reviewer fix loop: added create-time validation of the generated starter draft through the same draft validation path before insert, so future schema/helper drift fails before writing an invalid starter draft.
- Verification evidence after reviewer fix: `npm run test:schema` passed 12/12 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed.
- Risk note: server-action browser form submission remains covered by implementation/static checks and direct DB smoke rather than a full Playwright-style form POST; M1-04 does not yet include a formal e2e test harness. Carry one manual browser pass into milestone-close QA.
- Lead disposition: M1-04 accepted and commit-ready.
- Next step: dispatch M1-05 implementation Worker for publish versions and immutability guardrails.

### M1-05 Publish Version And Immutability

- Status: implementation complete
- Reason: next Milestone 1 handover task after questionnaire CRUD/draft editor.
- Scope: publish action from questionnaire edit page, publish note input, publish-time schema validation, immutable `QuestionnaireVersion` snapshots, version listing, version number sequencing, publish attribution, and guardrails preventing published snapshot mutation.
- Worker: M1-05 implementation worker
- Reviewer: pending
- Verification evidence: `npm run test:schema`, `npm run typecheck`, `npm run lint`, `npm run build`, and clean DB migrate/seed smoke passed.
- Risks: immutable version contract is foundational for M1-06 answering; publish snapshots saved drafts only, so unsaved editor text is intentionally not published.
- Next step: dispatch M1-06 implementation Worker for answer page and idempotent submit API.

#### Worker Result - M1-05

- Worker: M1-05 implementation worker
- Status: implementation complete
- Files added/updated: `lib/questionnaires/publish.ts`, `lib/questionnaires/publish.test.mjs`, `app/admin/questionnaires/actions.ts`, `app/admin/questionnaires/[id]/page.tsx`, `app/admin/questionnaires/questionnaire-publish-panel.tsx`, `app/globals.css`, `lib/questionnaires/draft.ts`, `package.json`, `tsconfig.json`, `README.md`, `handovers/progress.md`.
- Summary: added publish server action from the questionnaire edit page, required publish note input, publish-time validation through `validateQuestionnaireDraftText`, per-questionnaire version number sequencing, `nanoid(21)` version IDs and test tokens, immutable JSON `schemaSnapshot` storage, selected-member `publishedByMemberId` attribution, and an edit-page version list showing version number, note, publisher, created time, token, and token status. Added `updateQuestionnaireVersionMutableFields()` plus immutable-field rejection for `schemaSnapshot`, `versionNumber`, `questionnaireId`, `publishedByMemberId`, and `createdAt`.
- Verification evidence: `npm run test:schema` passed 14/14 tests, including publish smoke coverage for versionNumber 1 then 2, `publishedByMemberId`, 21-character test tokens, first snapshot staying unchanged after draft edit, invalid draft rejection before insert, and immutable field update rejection through the helper path. `npm run typecheck`, `npm run lint`, and `npm run build` passed. Clean DB smoke with `DATABASE_URL=file:./data/m1-05-lead2.sqlite` passed `npm run db:migrate` and then `npm run db:seed`, inserting 4 members.
- Scope note: no M1-06 answering/scoring, auto-publish, DB migration, new infrastructure, queue, Redis/PostgreSQL/MySQL, dynamic code execution, or drag-and-drop editor was introduced.
- Risk note: application-level guardrails protect helper/action update paths; direct ad hoc SQL against the SQLite database can still mutate rows because no DB trigger was added.

#### Lead Verification - M1-05

- Lead: Delivery Lead
- Status: verification in progress pending independent reviewer verdict
- Lead fix loop: tightened `publishQuestionnaireVersion()` option validation so override IDs and test tokens used by tests/smokes must also be 21 characters, matching the `nanoid(21)` production contract. Updated focused tests to use 21-character fixed version IDs and to assert short override tokens are rejected before insert.
- Static/focused verification after fix: `npm run test:schema` passed 14/14 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and showed the existing admin routes, with `/admin/questionnaires/[id]` including the publish panel bundle.
- Clean DB verification: `DATABASE_URL=file:./data/m1-05-lead2.sqlite npm run db:migrate` passed; then `DATABASE_URL=file:./data/m1-05-lead2.sqlite npm run db:seed` passed with 4 members. A prior parallel migrate/seed attempt failed because seed raced before migration completed; sequential rerun passed and is the valid evidence.
- Direct publish smoke: on `data/m1-05-lead2.sqlite`, inserted a questionnaire draft, published v1 with `publishedByMemberId=member_team_001`, edited `currentDraftSchema`, published v2, and read back two rows. Evidence: v1 and v2 publish returned ok; version numbers were 1 and 2; both test tokens were 21 characters; v1 snapshot contained `Lead Smoke v1` and not `Lead Smoke v2`; v2 snapshot contained `Lead Smoke v2`; neither snapshot contained `MUTATED`.
- Guardrail smoke: `updateQuestionnaireVersionMutableFields()` rejected `{ schemaSnapshot: ... }` with `Cannot update immutable questionnaire version fields: schemaSnapshot`; a publish attempt with a short override token returned `Generated version ID and test token must be 21 characters.` and inserted no extra row.
- Reviewer: independent `code-reviewer` returned `CHANGES_REQUESTED`.
- Reviewer finding: concurrent publishes could both compute the same `max(versionNumber) + 1`; the unique index would prevent duplicate rows, but the losing request could throw a SQLite unique-constraint exception through the server action instead of retrying or returning a controlled domain error.
- Reviewer fix loop: added bounded publish retry around version allocation/insert that catches only SQLite unique-constraint conflicts, rereads latest version, and retries with freshly generated IDs/tokens on production paths. Added deterministic regression coverage using a test-only `beforeInsert` hook to simulate another publish winning the same version number; the helper now publishes the retry as the next version instead of throwing. If all attempts collide, it returns `Could not publish a unique questionnaire version. Please retry.`
- Verification evidence after reviewer fix: `npm run test:schema` passed 15/15 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed.
- Risk note: immutable protection is application-level by helper/action path, not a SQLite trigger; direct manual SQL can still mutate rows. This matches the handover's "application code rejects attempts" acceptance but should be revisited if production ops require DB-level hardening.
- Reviewer re-check: independent `code-reviewer` returned `APPROVED`; original concurrent publish finding is resolved, no new blockers found. Reviewer verified `npm run typecheck` and `npm run test:schema` 15/15 passed.
- Lead disposition: M1-05 accepted and commit-ready.
- Next step: dispatch M1-06 implementation Worker for answer page and idempotent submit API.

### M1-06 Answer Page And Idempotent Submit API

- Status: in progress
- Reason: next Milestone 1 handover task after immutable published versions.
- Scope: internal answer page for published versions, answer form rendering for schema questions, idempotent submit API/server action, response rows bound to immutable `versionId`, selected member attribution, and immediate choice-based scoring/status sufficient for M1 internal flow.
- Worker: M1-06 implementation worker disconnected; Delivery Lead completed implementation directly
- Reviewer: independent `code-reviewer` returned `APPROVED_WITH_NOTES`; Lead fixed both notes before acceptance.
- Verification evidence: `npm run test:schema`, `npm run typecheck`, `npm run lint`, `npm run build`, clean DB migrate/seed, direct idempotent submit smoke, and reviewer-note regression tests passed.
- Risks: must populate `responses.submitterKey` exactly as defined in M1-01; submit must bind to `QuestionnaireVersion.schemaSnapshot`, not mutable draft; no AI/open-answer async work should be introduced in M1-06.
- Next step: dispatch M1-07 implementation Worker for scoring engine and choice-only result page.

#### Worker Result - M1-06

- Worker: M1-06 implementation worker
- Status: errored before completion (`stream disconnected before completion`); no usable Worker handoff was received.
- Lead recovery: Delivery Lead implemented the task directly to keep the milestone moving, then submitted the result to an independent Reviewer.

#### Lead Implementation And Verification - M1-06

- Lead: Delivery Lead
- Status: completed
- Files added/updated: `lib/responses/submit.ts`, `lib/responses/submit.test.mjs`, `app/admin/questionnaires/[id]/versions/[versionId]/answer/`, `app/admin/questionnaires/questionnaire-publish-panel.tsx`, `app/globals.css`, `package.json`, `README.md`, `handovers/progress.md`.
- Summary: added internal published-version answer links, an internal answer page that parses immutable `QuestionnaireVersion.schemaSnapshot`, a client form with localStorage-backed `clientSubmissionId` and draft answers, server action submission through `requireSelectedAdminMember()`, and a testable `submitResponse()` helper that validates answer shapes, binds responses to `versionId`, uses internal `memberId` as `submitterKey`, generates 21-character response/result tokens, and returns existing responses for duplicate idempotency tuples.
- Lead fix loop: tightened SQLite unique-conflict handling so only the idempotency unique tuple is treated as a duplicate retry; unrelated unique failures such as `responses.result_token` collisions are not misclassified as idempotent responses.
- Focused test evidence: `npm run test:schema` passed 20/20 tests, including valid internal submit with single/multiple/open answers, duplicate same `clientSubmissionId` returning the same response, unknown option rejection, choice-only questionnaires returning initial `completed` status, and result-token uniqueness not being treated as an idempotent retry.
- Static/build evidence: `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and showed the new `/admin/questionnaires/[id]/versions/[versionId]/answer` route.
- DB smoke evidence: sequential `DATABASE_URL=file:./data/m1-06-lead.sqlite npm run db:migrate` then `npm run db:seed` passed with 4 members. A prior parallel migrate/seed attempt failed because seed raced before migration completed; sequential rerun is the valid evidence.
- Direct idempotency smoke: on `data/m1-06-lead.sqlite`, inserted a published version, submitted an internal response with single/multiple/open answers, submitted the same `clientSubmissionId` again with different generated IDs, and confirmed the second result returned the first response ID/result token with `created=false`; DB row count remained 1; row had `submitterKey=member_team_001` and answer keys `single`, `multi`, `open`.
- Reviewer: independent `code-reviewer` returned `APPROVED_WITH_NOTES`.
- Reviewer notes: server-side validation accepted duplicate multiple-choice option IDs in tampered JSON, which could double-count later scoring; server-side validation also accepted answer keys not present in the published schema, loosening the persisted `responses.answers` contract.
- Reviewer fix loop: updated `validateAnswers()` to reject unknown answer question IDs before persistence and reject duplicate option IDs for multiple-choice answers. Added regression tests that duplicate multiple-choice IDs and extra answer keys both fail and insert no response rows.
- Verification evidence after reviewer fix: `npm run test:schema` passed 22/22 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and showed `/admin/questionnaires/[id]/versions/[versionId]/answer`.
- Scope note: no external tester flow, result page, M1-07 scoring engine, AI client, queue, Redis/PostgreSQL/MySQL, dynamic code execution, or published snapshot mutation was introduced.
- Risk note: client-side localStorage preserves draft answers and `clientSubmissionId`, but full browser-click submit has not yet been run; helper/server-action behavior is covered by tests and direct DB smoke.
- Lead disposition: M1-06 accepted and commit-ready.
- Next step: dispatch M1-07 implementation Worker for scoring engine and choice-only result page.

### M1-07 Scoring Engine And Choice-Only Result Page

- Status: completed
- Reason: final Milestone 1 task after internal answer/idempotent submit.
- Scope: pure additive scoring engine, choice-only synchronous scoring persistence, internal result page, focused scoring tests, and minimal submit/result linking.
- Worker: M1-07 implementation worker
- Reviewer: independent `code-reviewer` returned `APPROVED_WITH_NOTES`; no correctness bugs found.
- Verification evidence: `npm run test:schema` passed 28/28 tests, including scoring engine coverage for single choice, multiple choice, missing answers, unknown options, theoretical range derivation, and formula not being read/executed. `npm run typecheck`, `npm run lint`, and `npm run build` passed; build listed the new `/admin/responses/[responseId]` route. Clean DB smoke with `DATABASE_URL=file:./data/m1-07-worker2.sqlite` passed `npm run db:migrate` and `npm run db:seed`; a direct choice-only submit through `submitResponse()` persisted `aiScoringStatus=completed`, `finalVector={"focus":3,"risk":2}`, and two per-question contribution rows. Lead repeated clean DB smoke on `data/m1-07-lead3.sqlite`: migrate and seed passed; direct choice-only submit with 21-character response/result token returned `completed` and persisted `finalVector={"focus":3,"risk":2}` plus two per-question rows.
- Summary: added `lib/scoring/engine.ts` as a DB-free/session-free/AI-free pure scoring module that sums choice and supplied open-answer deltas, derives theoretical ranges, and emits normalized values only where derivable. Choice-only submissions now persist `perQuestionScores` and `finalVector` synchronously while open-answer questionnaires remain `pending` for later AI milestones. Added an internal admin result page that loads `Response.versionId -> QuestionnaireVersion.schemaSnapshot`, displays raw vectors, dimension descriptions, top/bottom features, and per-question contributions, with recomputation fallback for older rows missing persisted score JSON.
- Scope note: no AI client/worker, public result route, external tester flow, feedback, queue, Redis/PostgreSQL/MySQL, dynamic code execution, drag editor, DB schema change, or commit was introduced.
- Risk note: full browser-click result navigation was not run; result rendering is covered by type/build checks and direct DB submit smoke. Open-answer rows intentionally keep `pending` behavior until M2 async scoring.

### M2-04 Debug Interpretation

- Status: completed
- Reason: next Milestone 2 handover task after async open-answer scoring worker and polling.
- Scope: debug interpretation prompt assembly, AI call after final vector availability, persisted `responses.debugInterpretation`, completed-response worker scan for choice-only rows, result-page rendering, and failure recording that preserves scoring results.
- Worker: M2-04 implementation worker; M2-04 fix-loop Worker
- Reviewer: independent `code-reviewer` returned `CHANGES_REQUESTED`; re-check returned `APPROVED`
- Files added/updated: `lib/responses/debug-interpretation.ts`, `lib/responses/debug-interpretation.test.mjs`, `lib/responses/open-answer-scoring.ts`, `lib/responses/open-answer-scoring-worker.ts`, `lib/responses/open-answer-scoring.test.mjs`, `app/api/admin/responses/[responseId]/status/route.ts`, `app/admin/responses/[responseId]/page.tsx`, `app/admin/responses/[responseId]/response-scoring-status-panel.tsx`, `README.md`, `handovers/progress.md`.
- Summary: added a testable debug interpretation helper with injectable AI caller. Its prompt includes questionnaire title, dimensions, final vector, top/bottom dimensions, key choices, open answers, AI scoring rationale, and `resultDebugPrompt`, and instructs the model not to present scientific diagnosis or deterministic school/career advice. Open-answer processing now generates debug interpretation after scores/final vector are persisted, restoring the final scoring status afterward. The worker also scans completed/partially_failed/failed responses with a final vector but no debug interpretation, covering choice-only responses already completed by submit. Result status polling includes `generating_debug_interpretation` and the result page renders stored debug interpretation.
- Lead verification evidence: static review confirmed the prompt includes questionnaire title, dimensions, final vector, top/bottom dimensions, key choices, open answers, AI scoring rationale, and `resultDebugPrompt`; result page selects/renders `debugInterpretation`; status API and polling panel expose `generating_debug_interpretation` plus `hasDebugInterpretation`. `npm run test:schema` passed 51/51 tests, including prompt-content assertions, successful completed-response debug persistence, and debug failure preserving `perQuestionScores`/`finalVector`; the known non-failing Node `MODULE_TYPELESS_PACKAGE_JSON` warning remains. `npm run typecheck` passed. `npm run lint` passed. `npm run build` passed and listed `/admin/responses/[responseId]` plus `/api/admin/responses/[responseId]/status`.
- Lead DB smoke evidence: an isolated SQLite smoke seeded one completed response with a final vector and one `partially_failed` response with an existing open-answer scoring error. `processNextDebugInterpretationResponse()` called the fake AI with purpose `debug_interpretation`, required prompt content, persisted `debugInterpretation`, and restored status to `completed` while leaving `finalVector={"clarity":2,"initiative":2}`. A forced debug failure on the `partially_failed` row restored `partially_failed`, left `debugInterpretation=null`, preserved `finalVector={"clarity":2,"initiative":0}`, and merged `aiScoringError.debug_interpretation={"status":"failed","error":"debug AI down"}` without deleting the prior scoring error.
- Reviewer finding: `generating_debug_interpretation` rows could become undiscoverable after a process crash between claim and persistence, leaving the result page polling forever. Reviewer also found the polling panel could display `hasDebugInterpretation=true` while the server-rendered debug text section still showed the placeholder until manual refresh.
- Fix loop: made `generating_debug_interpretation` a claimable debug worker state and added a transient `aiScoringError.debug_interpretation_claim.finalStatus` marker so crash recovery can restore the original final status. Success removes only the claim marker and preserves prior scoring errors; debug failure removes the claim marker, records `debug_interpretation.status=failed`, restores the final status, and preserves answers, scores, and final vector. Legacy stuck rows without a claim marker fall back to `completed` when there are no scoring errors and `partially_failed` when prior scoring error data exists. The polling panel now receives initial final-vector/debug booleans and calls `router.refresh()` once when polling first observes `hasDebugInterpretation=true`, so the server-rendered debug text appears without a manual refresh.
- Verification evidence after fix: `npm run test:schema` passed 53/53 tests, including stuck `generating_debug_interpretation` recovery and original-final-status preservation; the known non-failing Node `MODULE_TYPELESS_PACKAGE_JSON` warning remains. `npm run typecheck` passed. `npm run lint` passed. `npm run build` passed and listed `/admin/responses/[responseId]` plus `/api/admin/responses/[responseId]/status`.
- Lead recovery smoke after fix: an isolated SQLite row stuck at `aiScoringStatus=generating_debug_interpretation` with `aiScoringError.open` plus `debug_interpretation_claim.finalStatus=partially_failed` was picked up by `processNextDebugInterpretationResponse()`, generated debug text, restored `partially_failed`, preserved `finalVector={"clarity":1}`, preserved the prior `open` scoring error, and removed the claim marker.
- Scope note: no M2-05 rescore, M2-06 feedback, M2-07 export, public result route, new dependency, Redis/PostgreSQL/MySQL/BullMQ, dynamic code execution, drag editor, or client-side AI key exposure was introduced.
- Risk note: debug failures are not retried indefinitely by the worker because the error is recorded under `aiScoringError.debug_interpretation` and skipped on later scans; M2-05 rescore can provide explicit regeneration/retry behavior if desired.
- Reviewer re-check: independent `code-reviewer` returned `APPROVED`; previous stuck `generating_debug_interpretation` recovery and polling/render refresh findings are resolved. Reviewer reran targeted debug tests, `npm run typecheck`, and `npm run lint`; no new blockers found.
- Lead disposition: M2-04 accepted and commit-ready.
- Next step: dispatch M2-05 implementation Worker for single-response rescoring.

### M2-05 Single-Response Rescoring

- Status: completed
- Reason: next Milestone 2 handover task after debug interpretation.
- Scope: admin-triggered single-response rescore, recomputed open-answer scores, final vector and debug interpretation regeneration, immutable version snapshot use, preserved answers, and AI call history through `AiCallLog`.
- Worker: M2-05 implementation Worker; Lead applied a typecheck fix
- Reviewer: independent `code-reviewer` returned `APPROVED_WITH_NOTES`
- Files added/updated: `lib/responses/rescore.ts`, `lib/responses/rescore.test.mjs`, `lib/responses/open-answer-scoring.ts`, `app/admin/responses/actions.ts`, `app/admin/responses/[responseId]/page.tsx`, `README.md`, `handovers/progress.md`.
- Summary: added a testable `rescoreResponse()` helper that loads the response with its bound `QuestionnaireVersion.schemaSnapshot`, reruns all open-answer scoring through the existing AI client path, recomputes `perQuestionScores` and `finalVector`, clears/regenerates `debugInterpretation` on successful recompute, and relies on existing AI client logging for `open_answer_scoring` plus `debug_interpretation` call history. The admin response detail page now includes a selected-member-protected rescore action and displays a redirect notice with the rescore outcome.
- Worker/Lead fix loop: Lead verification found `app/admin/responses/actions.ts` failed `tsc --noEmit` because `redirect()` did not narrow `parsed.data`/result union control flow. Fixed by explicitly returning from redirect branches so the success path narrows correctly.
- Verification evidence: `npm run test:schema` passed 55/55 tests, including immutable snapshot use instead of mutable draft, final vector change with fake AI output, preserved answers, AI log records for open scoring and debug generation, debug regeneration, and failed provider rescore preserving existing answers/scoring data while recording failure. `npm run typecheck` passed after the Lead action fix. `npm run lint` passed. `npm run build` passed and listed `/admin/responses/[responseId]` plus `/api/admin/responses/[responseId]/status`.
- Lead DB smoke evidence: an isolated SQLite smoke seeded a response whose mutable draft differed from the published snapshot, then called `rescoreResponse()` with fake AI. The fake AI asserted the prompt contained `Snapshot Open` and did not contain mutable draft text. Rescore returned `completed`, scored 1 open question, called AI twice, preserved `answers={"choice":"base","open":"I clarified ambiguity and shipped."}`, updated `finalVector={"clarity":3,"initiative":2}`, regenerated `debugInterpretation="Lead smoke regenerated debug."`, and left `aiScoringError=null`.
- Scope note: no per-question rescore UI, batch rescore, M2-06 feedback, M2-07 export, public result route, new dependency, Redis/PostgreSQL/MySQL/BullMQ, dynamic code execution, drag editor, or client-side AI key exposure was introduced.
- Risk note: v1 implements full single-response rescore rather than per-open-question rescore. Browser-click rescore was not run; helper/action behavior is covered by focused tests, type/build, and direct DB smoke.
- Reviewer notes: no blocking findings. Reviewer independently ran `npm run test:schema` 55/55, `npm run typecheck`, `npm run lint`, and `npm run build`; static scan found no forbidden infrastructure, dynamic code execution, client AI key exposure, raw secret logging, or drag-editor expansion. Residual gaps are no browser-click rescore and no live valid-provider AI run.
- Lead disposition: M2-05 accepted and commit-ready.
- Next step: dispatch M2-06 implementation Worker for feedback form.

### M2-06 Feedback Form

- Status: completed
- Reason: next Milestone 2 handover task after single-response rescoring.
- Scope: response-level feedback helper, public result-token feedback API, admin result-page feedback form, upsert/edit duplicate behavior, and focused feedback tests.
- Worker: M2-06 implementation Worker
- Reviewer: independent `code-reviewer` returned `APPROVED_WITH_NOTES`
- Files added/updated: `lib/responses/feedback.ts`, `lib/responses/feedback.test.mjs`, `app/api/public/responses/[resultToken]/feedback/route.ts`, `app/admin/responses/[responseId]/feedback-form.tsx`, `app/admin/responses/[responseId]/page.tsx`, `app/globals.css`, `README.md`, `handovers/progress.md`.
- Summary: added a zod-validated `submitFeedback()` helper that accepts raw write input, verifies the addressed `resultToken` maps to exactly one response, validates all four scores as integers from 1 to 5, trims/bounds the comment, stores reserved `questionComments` as null, and uses the existing unique `feedback.responseId` constraint for upsert/edit behavior. `POST /api/public/responses/[resultToken]/feedback` exposes the token-safe public API with 400 validation failures and 404 unknown-token failures. The admin response detail page now shows existing feedback and submits through that same public route.
- Verification evidence: `npm run test:schema` passed 60/60 tests, including feedback creation, out-of-range score rejection before writes, unknown result token rejection, duplicate submit updating the same feedback row, and response answers/scoring/debug fields remaining unchanged. `npm run typecheck` passed. `npm run lint` passed. `npm run build` passed and listed `/api/public/responses/[resultToken]/feedback`.
- Lead DB smoke evidence: an isolated SQLite smoke submitted invalid score feedback and received a validation failure before writes; submitted valid feedback for `resulttoken0000000001`; submitted again for the same token with different scores/comment and observed the same feedback ID updated with `feedbackCount=1`; submitted a wrong token and received `Result not found.`; confirmed `responses.answers`, `finalVector`, and `debugInterpretation` were unchanged.
- Scope note: no DB schema change, per-question feedback UI, broad public result route, new dependency, Redis/PostgreSQL/MySQL/BullMQ, dynamic code execution, drag editor, published-version mutation, response/scoring mutation, or client-side AI key exposure was introduced.
- Reviewer note and Lead fix: Reviewer found the public feedback API returned internal `responseId` in its success payload. Lead removed `responseId` from the public response so the endpoint now returns only `updated` status. Verification after fix: targeted feedback tests passed, `npm run typecheck` passed, `npm run lint` passed, and `npm run build` passed with `/api/public/responses/[resultToken]/feedback`.
- Risk note: browser-click/manual feedback submit was not run; behavior is covered by helper tests plus Next type/build compilation. External public result page remains a later M3 task, but the public token-safe API exists for it.
- Lead disposition: M2-06 accepted and commit-ready.
- Next step: dispatch M2-07 implementation Worker for JSON export.

### M2-01 AI Client And Connection Self-Test

- Status: completed
- Reason: first Milestone 2 handover task after M1 completion.
- Scope: server-only AI client foundation, env-based OpenAI-compatible chat/completions call, 60-second timeout, one safe retry, sanitized `AiCallLog` writes, admin settings self-test API/UI, and focused AI tests.
- Worker: M2-01 implementation worker
- Reviewer: independent `code-reviewer` returned `CHANGES_REQUESTED`; re-check returned `APPROVED` after fix loop.
- Verification evidence: `npm run test:schema`, `npm run typecheck`, `npm run lint`, `npm run build`, clean DB migrate/seed, invalid-config admin API smoke, and reviewer-fix config API smoke passed.
- Risks: valid-credential live AI self-test was not run unless credentials are available in the environment; invalid-config path is covered by focused test and local API smoke.
- Next step: dispatch M2-02 implementation Worker for AI schema draft generation.

#### Worker Result - M2-01

- Worker: M2-01 implementation worker
- Status: implementation complete
- Files added/updated: `lib/ai/client.ts`, `lib/ai/client.test.mjs`, `app/api/admin/ai/self-test/route.ts`, `app/admin/settings/page.tsx`, `app/admin/settings/ai-self-test-panel.tsx`, `app/admin/page.tsx`, `app/globals.css`, `package.json`, `README.md`, `handovers/progress.md`.
- Summary: added a server-only injectable AI client that reads `AI_API_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`; targets `${baseUrl}/chat/completions`; applies a 60-second timeout; retries one retryable failure; strips fenced JSON for future zod parsing; logs success/failure to `AiCallLog` without request headers or API keys; and exposes an admin-protected settings page/API for connection self-test with model, latency, and summarized error.
- Lead fix loop: changed library-local imports to test-executable relative imports, lazily imports `createDb()` only when no test DB is injected, runs Node tests with the `react-server` condition so `server-only` marker imports resolve safely, and explicitly redacts the configured API key from failure error summaries before returning or logging them.
- Verification evidence after Lead fix: `npm run test:schema` passed 35/35 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and listed `/admin/settings` plus `/api/admin/ai/self-test`.
- Clean DB/API smoke: `DATABASE_URL=file:./data/m2-01-lead.sqlite npm run db:migrate` passed; `npm run db:seed` inserted 4 members. With local dev server on `127.0.0.1:3021`, login returned `200`; `GET /api/admin/ai/self-test` returned config booleans and model without key; `POST /api/admin/ai/self-test` with no `AI_API_KEY` returned `ok=false`, `model=test-model`, latency, and a safe configuration error. The latest `ai_call_logs` row recorded `purpose=connection_self_test`, `status=failure`, safe input summary/error, null output, and no actual secret/header values.
- Reviewer: independent `code-reviewer` returned `CHANGES_REQUESTED`.
- Reviewer finding: PRD 11.8 requires settings to show the current AI base URL and model while hiding the API key; the first implementation only showed whether the base URL was configured.
- Reviewer fix loop: added a sanitized `baseUrl` field to AI config status, strips username/password from malformed/provider URLs before returning it, renders the sanitized base URL in the settings panel, and added regression coverage that displayed base URL credentials and API key values do not appear in config status.
- Verification evidence after reviewer fix: `npm run test:schema` passed 36/36 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed. Local API smoke with `AI_API_BASE_URL=https://user:pass@ai.invalid.local/v1` returned config `baseUrl=https://ai.invalid.local/v1`, `apiKeyConfigured=false`, and no user/password/key value.
- Reviewer re-check: independent `code-reviewer` returned `APPROVED`; no remaining findings.
- Scope note: no M2-02 schema generation, M2-03 worker, open-answer scoring, debug interpretation, feedback, export, DB migration, Redis/PostgreSQL/MySQL/BullMQ, dynamic code execution, or browser-secret exposure was introduced.
- Risk note: live valid-provider verification depends on real credentials; invalid config/error paths are covered without real network or credentials.
- Lead disposition: M2-01 accepted and commit-ready.
- Next step: dispatch M2-02 implementation Worker for AI schema draft generation.

### M2-02 AI Schema Draft Generation

- Status: completed
- Reason: next Milestone 2 handover task after server-only AI client and self-test.
- Scope: admin AI schema draft generation from pasted source text, generation mode selection, server-side AI call with `schema_draft_generation` logging, zod validation of AI questionnaire JSON, invalid-output repair UI, and explicit confirmation before writing `Questionnaire.currentDraftSchema`.
- Worker: M2-02 implementation worker errored before final handoff; Delivery Lead completed recovery implementation directly.
- Reviewer: independent `code-reviewer` returned `APPROVED`; no required fixes.
- Verification evidence: `npm run test:schema` passed 43/43 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and listed the updated `/admin/questionnaires/[id]` route. Sequential clean DB verification with `DATABASE_URL=file:./data/m2-02-lead.sqlite npm run db:migrate` and then `npm run db:seed` passed with 4 members. Direct helper smoke on `data/m2-02-lead.sqlite` confirmed a valid AI-generated draft result leaves the questionnaire row unchanged after generation, then `confirmQuestionnaireDraftUpdate()` writes the generated title/schema only after explicit confirmation.
- Risks: no real valid-provider AI generation was run because credentials are not available; valid and invalid AI outputs are covered through deterministic test doubles. A prior parallel migrate/seed attempt failed due to the known race where seed can run before migrations; sequential rerun is the valid evidence.
- Next step: dispatch M2-03 implementation Worker for async open-answer scoring worker and result polling.

#### Worker Result - M2-02

- Worker: M2-02 implementation worker
- Status: errored before completion (`unexpected status 521` from the subagent service); partial file edits were present in the worktree.
- Lead recovery: Delivery Lead preserved the useful partial direction, completed missing helper/action/UI/test integration, fixed interface mismatches, and ran verification before requesting independent review.

#### Lead Implementation And Verification - M2-02

- Lead: Delivery Lead
- Status: completed
- Files added/updated: `lib/ai/schema-draft.ts`, `lib/ai/schema-draft.test.mjs`, `lib/questionnaires/draft-server.ts`, `lib/questionnaires/draft-server.test.mjs`, `app/admin/questionnaires/actions.ts`, `app/admin/questionnaires/questionnaire-editor-form.tsx`, `README.md`, `handovers/progress.md`.
- Summary: added a testable AI schema draft helper that builds JSON-only questionnaire prompts for five generation modes, calls the existing server-only AI client with purpose `schema_draft_generation`, validates AI JSON through the central questionnaire zod schema, and returns either formatted draft JSON or validation/raw-output repair details. The edit page now offers a source-text AI generation panel; generated JSON is held in client state and can be edited/repaired before an explicit confirmation action. Confirmation re-validates on the server and only then writes `currentDraftSchema`, title, description, and scenario. Generated drafts are not published automatically and generation alone does not overwrite the saved draft.
- Focused test evidence: `npm run test:schema` passed 43/43 tests, including prompt construction, valid generated JSON formatting, invalid questionnaire output preserving raw output, malformed JSON repair output, short source rejection before AI call, confirmation-only overwrite behavior, and invalid confirmation preserving the existing draft.
- Static/build evidence: `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and showed `/admin/questionnaires/[id]` at 18.1 kB first-load route bundle.
- DB/helper smoke evidence: on `data/m2-02-lead.sqlite`, deterministic AI test-double generation returned `generatedOk=true`; the row remained unchanged after generation (`unchangedAfterGenerate=true`); explicit confirmation returned `confirmedOk=true`; the row then had `finalTitle=M2-02 Generated` and contained the generated question text.
- Reviewer: independent `code-reviewer` returned `APPROVED` after reviewing the requested M2-02 files and supporting AI/draft modules. Reviewer verified no critical/high/medium/low issues, confirmed all M2-02 acceptance points, ran `npm run test:schema` 43/43, `npm run typecheck`, `npm run lint`, and `npm run build`, and found no AI key exposure, forbidden infra, dynamic execution, raw HTML injection, or drag editor patterns in scope.
- Scope note: no auto-publish, no automatic current draft overwrite on generation, no client-side AI key exposure, no new infrastructure, no Redis/PostgreSQL/MySQL/BullMQ, no dynamic code execution, no drag editor, and no DB migration was introduced.
- Risk note: live valid-provider generation remains unverified without real AI credentials; invalid/malformed AI output recovery is covered by unit tests and UI render/build checks.
- Lead disposition: M2-02 accepted and commit-ready.
- Next step: dispatch M2-03 implementation Worker for async open-answer scoring worker and result polling.

### M2-03 Async Open-Answer Scoring Worker And Polling

- Status: completed
- Reason: next Milestone 2 handover task after AI schema draft generation.
- Scope: database-backed async open-answer scoring worker, persisted scoring status transitions, concurrent per-question AI scoring, zod validation of AI outputs, final vector persistence, result status polling API/UI, and restart-discoverable unfinished response states.
- Worker: M2-03 implementation worker completed; Lead requested and received a fix for a dynamic-code-execution violation before verification.
- Reviewer: independent `code-reviewer` returned `CHANGES_REQUESTED`; after fix loop, re-check returned `APPROVED_WITH_NOTES`.
- Verification evidence: after reviewer fix, `npm run test:schema` passed 48/48 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and listed `/api/admin/responses/[responseId]/status`. Sequential clean DB verification with `DATABASE_URL=file:./data/m2-03-lead.sqlite npm run db:migrate` and then `npm run db:seed` passed with 4 members. Direct helper smoke on `data/m2-03-lead.sqlite` confirmed an open-answer submit returned `pending`, `processNextOpenAnswerResponse()` completed scoring with fake AI, persisted `aiScoringStatus=completed`, `finalVector={"clarity":3,"initiative":1}`, null `aiScoringError`, and 3 per-question score rows.
- Risks: no real AI-provider open-answer scoring was run because credentials are not available; concurrency/failure behavior is covered by deterministic test doubles. M2-03 intentionally does not generate debug interpretation yet; that remains M2-04.
- Next step: dispatch M2-04 implementation Worker for debug interpretation after final vector calculation.

#### Worker Result - M2-03

- Worker: M2-03 implementation worker
- Status: implementation complete after Lead-requested fix
- Files added/updated: `instrumentation.ts`, `next.config.ts`, `lib/responses/open-answer-scoring.ts`, `lib/responses/open-answer-scoring-worker.ts`, `lib/responses/open-answer-scoring-worker.edge.ts`, `lib/responses/open-answer-scoring.test.mjs`, `app/api/admin/responses/[responseId]/status/route.ts`, `app/admin/responses/[responseId]/response-scoring-status-panel.tsx`, `app/admin/responses/[responseId]/page.tsx`, `README.md`, `handovers/progress.md`.
- Summary: added a DB-queue open-answer scoring pipeline. `instrumentation.ts` starts a singleton worker in Node runtime; the worker scans every 2.5 seconds, claims `pending` or unfinished `scoring_open_answers` responses, scores open questions concurrently through `Promise.allSettled`, uses the existing server-only AI client with purpose `open_answer_scoring`, validates AI JSON through the central open-answer scoring zod factory, persists per-question scores/final vector/status/errors, and leaves original responses/answers intact on failures. The result page now renders a polling status panel backed by an admin-protected status API.
- Lead fix request: initial worker used `Function("return import(...)")`, violating the handover ban on dynamic code execution. Worker replaced it with static imports and added an edge-runtime no-op shim via `next.config.ts` alias so Next edge instrumentation compilation does not import the Node/server-only worker.
- Worker verification evidence: Worker reported `npm run test:schema` passed 46/46, `npm run typecheck` passed, `npm run lint` passed, `npm run build` passed, and a clean `data/m2-03-smoke.sqlite` migrate/seed passed.

#### Lead Verification - M2-03

- Lead: Delivery Lead
- Status: completed
- Static/focused verification: `npm run test:schema` passed 46/46 tests, including concurrent open-question scoring, `partially_failed` invalid AI output persistence without deleting answers, and all-open-failed persistence. `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and showed `/api/admin/responses/[responseId]/status`.
- Static safety scan: `rg "Function\\(|eval\\(|new Function|dangerouslySetInnerHTML|innerHTML|Redis|BullMQ|postgres|mysql" lib app instrumentation.ts next.config.ts package.json` returned no matches.
- DB smoke evidence: sequential `DATABASE_URL=file:./data/m2-03-lead.sqlite npm run db:migrate` and `npm run db:seed` passed. Direct helper smoke inserted a published questionnaire with two open questions, submitted an internal response with 21-character response/result tokens, observed initial `pending`, processed the next open-answer response with fake AI, and read back `completed`, null `aiScoringError`, `finalVector={"clarity":3,"initiative":1}`, and 3 per-question score rows.
- Scope note: no Redis/PostgreSQL/MySQL/BullMQ, dynamic code execution, drag editor, client-side AI key exposure, DB migration, auto-publish, schema draft overwrite behavior, debug interpretation, rescore action, feedback, or export was introduced.
- Risk note: process crash while a response is `scoring_open_answers` is recoverable because the worker currently treats both `pending` and `scoring_open_answers` as claimable on later scans; this may reprocess an in-flight row if multiple app processes are ever run, but v1 target is a single app process and the singleton guard prevents same-process overlap.
- Reviewer: independent `code-reviewer` returned `CHANGES_REQUESTED`.
- Reviewer finding: invalid open-answer model JSON/schema output was not retried once before marking a question failed. The existing AI client retry only covered transport/provider/envelope failures, while `parseAiJsonWithSchema()` validation happened after the logged AI success.
- Reviewer fix loop: added a narrow two-attempt loop around each open-question AI content call plus JSON/zod validation in `scoreOneOpenQuestion()`. Added regression tests proving an invalid first output is retried and can complete on a valid second output, and that a question is marked failed only after both validation attempts fail.
- Verification evidence after reviewer fix: `npm run test:schema` passed 48/48 tests; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed and showed `/api/admin/responses/[responseId]/status`.
- Reviewer re-check: independent `code-reviewer` returned `APPROVED_WITH_NOTES`; original invalid-output retry blocker is resolved. Non-blocking note: the scoring-layer retry currently catches `callAi()` errors as well as JSON/zod validation errors, so provider/config/transport failures may get one additional worker-level call beyond the AI client's own retry policy. This is accepted for M2-03 and can be narrowed later if retry policy hardening is needed.
- Lead disposition: M2-03 accepted and commit-ready.
- Next step: dispatch M2-04 implementation Worker for debug interpretation after final vector calculation.

### M2-07 JSON Export

- Status: completed
- Worker: M2-07 implementation Worker
- Scope: admin-protected single-response JSON export helper, API route, response detail page export link, focused export tests, README update.
- Files added/updated: `lib/export/response-export.ts`, `lib/export/response-export.test.mjs`, `app/api/admin/responses/[responseId]/export/route.ts`, `app/admin/responses/[responseId]/page.tsx`, `package.json`, `README.md`, `handovers/progress.md`.
- Summary: added `buildResponseJsonExport()` to join response, questionnaire, immutable questionnaire version, feedback, and response-linked AI call logs into a JSON-safe object for one response. `GET /api/admin/responses/[responseId]/export` returns that object as an attachment and is covered by the existing `/api/admin/*` middleware. The admin response detail page now exposes a `导出 JSON` link.
- Acceptance notes: export includes questionnaire/version metadata, immutable `schemaSnapshot`, answers, per-question scores, final vector, debug interpretation, AI scoring status/error, sanitized stored `AiCallLog` fields, and feedback when present. It intentionally excludes `testToken`, `resultToken`, `submitterKey`, `clientSubmissionId`, request headers, cookies, env vars, and API keys.
- Verification evidence: `npm run test:schema` passed 62/62 tests, including export shape, immutable `schemaSnapshot`, feedback, sanitized `AiCallLog` fields, and operational secret/token exclusion assertions. `npm run typecheck` passed. `npm run lint` passed. `npm run build` passed and listed `/api/admin/responses/[responseId]/export`.
- Scope note: no Redis/PostgreSQL/MySQL/BullMQ, dynamic code execution, drag editor, client-side AI key exposure, new dependency, DB migration, or response/questionnaire/version mutation was introduced.
- Lead verification: Delivery Lead reran `npm run test:schema` (62/62), `npm run typecheck`, `npm run lint`, and `npm run build`; build listed `/api/admin/responses/[responseId]/export`. Static inspection confirmed `buildResponseJsonExport()` reads response, questionnaire, immutable version snapshot, feedback, and response-linked AI logs; `GET /api/admin/responses/[responseId]/export` validates `responseId`, returns `404` for missing rows, `500` for invalid stored JSON, pretty JSON with `content-disposition: attachment`, and `cache-control: no-store`. A write-path scan for `insert(`, `update(`, `delete(`, `onConflict`, and `.run(` found writes only in `lib/export/response-export.test.mjs` seed setup, not in export implementation or route.
- Reviewer: independent `code-reviewer` returned `APPROVED`; no blocking or non-blocking correctness/security findings. Reviewer verified the export helper is read-only, the route is protected through `/api/admin/*` middleware, immutable `schemaSnapshot` and feedback are included, response interpretation fields and response-linked AI logs are present, operational tokens/secrets are omitted, `npm run test:schema` passed 62/62, and static scans found no dynamic execution or export write path.
- Lead disposition: M2-07 accepted and commit-ready.
- Next step: stop at the user-requested Milestone 2 boundary; do not dispatch Milestone 3.

## Milestone 2 Completion

- Status: completed
- Completed tasks: M2-01 AI Client And Connection Self-Test; M2-02 AI Schema Draft Generation; M2-03 Async Open-Answer Scoring Worker And Polling; M2-04 Debug Interpretation; M2-05 Single-Response Rescoring; M2-06 Feedback Form; M2-07 JSON Export.
- Final verification evidence: latest M2-07 closeout reran `npm run test:schema` (62/62), `npm run typecheck`, `npm run lint`, and `npm run build` successfully. Earlier task-level records above capture each Worker result, Reviewer verdict/fix loop, Lead verification, accepted risk, and next-step state.
- Risks carried forward: real-provider AI paths remain unverified without live credentials; several browser-click paths are covered by helper tests, type/build checks, and local API/DB smoke rather than a formal e2e harness; repository has no initial commit, so tasks remain commit-ready rather than committed.
- Stop condition: user requested stopping after Milestone 2 completion, so Milestone 3 is intentionally not started.

## Hand-Test Follow-Up: Members And Internal Notes

- Status: completed
- Reason: user hand testing found fixed seed-only member selection unclear and asked why questionnaire internal notes were disabled.
- Scope: allow admins to add/select attribution members by name with de-duplication, and persist questionnaire internal notes as backend-only draft metadata.
- Files updated: `lib/db/schema.ts`, `drizzle/0001_questionnaire_internal_note.sql`, `drizzle/meta/0001_snapshot.json`, `drizzle/meta/_journal.json`, `app/api/admin/session/member/route.ts`, `app/admin/member-picker.tsx`, `app/admin/page.tsx`, `app/admin/questionnaires/actions.ts`, `app/admin/questionnaires/questionnaire-create-form.tsx`, `app/admin/questionnaires/questionnaire-editor-form.tsx`, `app/admin/questionnaires/new/page.tsx`, `app/admin/questionnaires/[id]/page.tsx`, `app/admin/questionnaires/page.tsx`, `app/globals.css`, `README.md`, `handovers/progress.md`, and test SQLite fixtures under `lib/**/**/*.test.mjs`.
- Implementation notes: member creation uses admin session protection, zod-validates trimmed names, reuses an active existing member when the name already exists, otherwise creates a `nanoid(21)` member and selects it in the signed session. `questionnaires.internalNote` is stored in SQLite and editable on create/edit pages; it is intentionally backend-only and not copied into questionnaire schema drafts or published `schemaSnapshot`.
- Verification evidence: `npm run test:schema` passed 62/62; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed. `npm run db:generate` reported no schema changes after migration metadata cleanup. Fresh SQLite verification with `DATABASE_URL=file:./data/handtest-followup-fresh.sqlite npm run db:migrate` and `npm run db:seed` passed. Direct DB smoke confirmed `questionnaires.internal_note` exists, one custom member name maps to one row (`memberCountForName=1`), the internal note persisted as `后台备注只给管理员看`, and the questionnaire JSON draft did not contain that internal note.
- Risk note: this hand-test follow-up did not add a formal browser e2e test; behavior is covered by type/build checks and direct DB smoke. Existing local SQLite files created before this migration must run `npm run db:migrate` before using the new internal note field.

## Hand-Test Follow-Up: DeepSeek Connection Self-Test

- Status: completed
- Reason: user hand testing with a valid DeepSeek base URL/API key/model reached the provider but self-test failed with `AI response did not include message content.`
- Scope: make the OpenAI-compatible AI client handle DeepSeek chat/completions thinking mode predictably without exposing secrets or changing app-level prompts.
- Files updated: `lib/ai/core.ts`, `lib/ai/client.test.mjs`, `lib/ai/schema-draft.ts`, `lib/ai/schema-draft.test.mjs`, `lib/responses/open-answer-scoring.ts`, `lib/responses/debug-interpretation.ts`, `lib/responses/debug-interpretation.test.mjs`, `handovers/progress.md`.
- Implementation notes: DeepSeek official chat/completions responses can include nullable `message.content` plus `reasoning_content` when thinking is enabled. The AI client now detects `*.deepseek.com` base URLs and applies purpose-specific provider options instead of disabling thinking globally: connection self-test uses `thinking: disabled`; schema draft generation and open-answer scoring use `thinking: disabled` plus `response_format: { type: "json_object" }`; debug interpretation uses `thinking: enabled` and plain text. If a provider still returns no final content, the error now includes `finish_reason` and notes when reasoning content was present. No SDK/dependency was added because the required behavior is a small provider-options policy over the existing fetch/zod client.
- Verification evidence: targeted `node --conditions=react-server --experimental-strip-types --experimental-specifier-resolution=node --test lib/ai/client.test.mjs lib/ai/schema-draft.test.mjs lib/responses/debug-interpretation.test.mjs` passed 20/20, including DeepSeek purpose-specific request-body coverage, JSON-mode coverage, and debug thinking coverage. `npm run test:schema` passed 64/64; `npm run typecheck` passed; `npm run lint` passed; `npm run build` passed.
- Risk note: live DeepSeek credentials were not run by the agent; this fix is based on the user's live self-test symptom plus provider-compatible response shape tests. The next manual self-test should be run with the same DeepSeek credentials after restarting the dev server.

## Hand-Test Follow-Up: Schema Format Guide

- Status: completed
- Reason: user noted individuals need a basic format explanation so they can seek outside help instead of only uploading source content to the website AI formatter.
- Scope: add a human-readable questionnaire JSON format reference and an admin page entry point.
- Files updated: `docs/questionnaire-schema-format.md`, `app/admin/questionnaires/format-guide/page.tsx`, `app/admin/questionnaires/page.tsx`, `app/admin/questionnaires/new/page.tsx`, `app/globals.css`, `handovers/progress.md`.
- Implementation notes: the guide explains top-level fields, dimensions, single-choice, multiple-choice, open-text scoring prompts, a minimal complete JSON example, a copyable external-help prompt, and a review checklist. Admin users can open it from the questionnaire list and new-questionnaire page at `/admin/questionnaires/format-guide`.
- Verification evidence: `npm run typecheck`, `npm run lint`, `npm run test:schema` (64/64), and `npm run build` passed. Build listed `/admin/questionnaires/format-guide`.
- Risk note: this is a static guide, not a formal docs rendering pipeline; future schema changes must update both `docs/questionnaire-schema-format.md` and the in-app format guide.
