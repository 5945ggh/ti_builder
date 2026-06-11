# TI Builder

Internal test production and validation workbench.

## Stack

- Next.js App Router with `output: 'standalone'`
- TypeScript
- SQLite + Drizzle ORM
- zod
- npm

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000` for the workbench entry and `http://localhost:3000/admin` for the admin shell.

## Admin Access

Admin UI and admin APIs are protected by a shared password session:

```bash
ADMIN_ACCESS_PASSWORD=change-me
SESSION_SECRET=replace-with-at-least-32-random-characters
```

- `ADMIN_ACCESS_PASSWORD` is the shared management password.
- `SESSION_SECRET` signs the httpOnly admin session cookie and must be at least 32 characters.
- After login, choose a member in `/admin`. The selected member is attribution plumbing for later admin writes, not an authentication boundary.
- If the member list is empty, run `npm run db:seed`.
- Admin members can be added by name from the workbench home page. Names are de-duplicated by the `members.name` unique constraint; entering an existing active member name selects it instead of creating a duplicate.
- Questionnaire drafts are managed at `/admin/questionnaires`. Create requires a selected member for `createdByMemberId`; edits require a selected member before saving. Draft metadata includes an internal note for backend operators; the note is not part of published `schemaSnapshot` data.
- M1-04 uses a JSON text editor for `currentDraftSchema`. Invalid JSON or schema validation errors are shown before save and invalid drafts are not written.
- Questionnaire edit pages can publish the saved draft as an immutable version with a required publish note. Publish validates the saved draft with the central zod schema, records the selected member as `publishedByMemberId`, increments `versionNumber` per questionnaire, stores a full JSON `schemaSnapshot`, and generates a `nanoid(21)` `testToken`.
- Published version immutable fields (`schemaSnapshot`, `versionNumber`, `questionnaireId`, `publishedByMemberId`, `createdAt`) are guarded in application code by `lib/questionnaires/publish.ts`.
- Published versions expose an internal answer link from the version list. Internal submits bind to the immutable `versionId`, use the selected member as both `memberId` and `submitterKey`, store raw answers as JSON, and return `responseId`, `resultToken`, and initial `aiScoringStatus`.
- Internal response idempotency is enforced by `versionId + source + submitterKey + clientSubmissionId`; duplicate retries return the existing response instead of inserting a second row.
- AI connection settings are checked at `/admin/settings`. The browser only receives configured/not-configured flags, model name, latency, and summarized errors; `AI_API_KEY` and request headers stay server-only. Self-tests use `lib/ai/client.ts`, call `${AI_API_BASE_URL}/chat/completions`, apply a 60 second timeout, retry one safe failure, and write sanitized rows to `AiCallLog`.
- Questionnaire edit pages include AI schema draft generation. Admins paste source text, choose a generation mode, and receive validated questionnaire JSON in the browser for review. Generation uses the server-only AI client with purpose `schema_draft_generation`; the generated draft is not published and does not overwrite `currentDraftSchema` until the admin explicitly confirms it. Confirmation re-validates the generated JSON before writing.
- Open-answer responses are scored asynchronously by an in-process singleton worker started from `instrumentation.ts`. The database is the queue: open-answer submits return `pending`, the worker claims rows as `scoring_open_answers`, calls AI concurrently per open question with purpose `open_answer_scoring`, validates every AI JSON score, persists `perQuestionScores`/`finalVector`, and the result page polls `/api/admin/responses/[responseId]/status` until scoring finishes.
- After a response has a `finalVector`, the same worker generates an internal debug interpretation with purpose `debug_interpretation`. The prompt includes the questionnaire title, dimensions, final vector, top/bottom dimensions, key choices, open answers, AI scoring rationale, and `resultDebugPrompt`, and explicitly forbids scientific diagnosis or deterministic school/career advice. Debug failures are recorded in `aiScoringError` without erasing persisted scores or vectors.
- Result pages include response-level feedback for interest, accuracy, share willingness, usefulness, and a comment. Feedback submits through the public token-safe `POST /api/public/responses/[resultToken]/feedback` endpoint, validates all scores as 1-5 before writing, stores reserved `questionComments` as null for v1, and upserts by the unique `feedback.responseId` row so duplicate submits edit the existing feedback instead of creating duplicates.
- Admin response detail pages include a JSON export link backed by `GET /api/admin/responses/[responseId]/export`. The export is admin-session protected and contains questionnaire/version metadata, the immutable `schemaSnapshot`, answers, per-question scores, final vector, debug interpretation, AI scoring status/error, sanitized stored `AiCallLog` fields, and feedback. It intentionally omits operational tokens, headers, cookies, environment variables, and API keys.

## Database

The app uses SQLite through Drizzle. `DATABASE_URL` accepts a `file:` URL and defaults to:

```bash
DATABASE_URL=file:./data/workbench.sqlite
```

The app and database scripts create the SQLite parent directory before connecting, so a clean checkout can run migrations without manually creating `data/`.

Useful commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

`npm run db:seed` inserts four stable starter team members and can be rerun without duplicating them. Additional members can be created from `/admin` during hand testing. SQLite database files under `data/` are ignored; `data/.gitkeep` only keeps the directory present.

Response idempotency has a database unique constraint on `versionId + source + submitterKey + clientSubmissionId`.
For internal submissions, `submitterKey` should use the selected member ID.
For external submissions, `submitterKey` should use the addressed test token or another stable non-null external submitter scope.

## AI Configuration

The AI client is server-only and reads these environment variables:

```bash
AI_API_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace-with-provider-key
AI_MODEL=gpt-4o-mini
```

The provider must support an OpenAI-compatible `POST /chat/completions` shape. Connection failures are logged with purpose, sanitized input summary, status, and summarized error only; API keys and request headers are not stored.

## Verification

```bash
npm run test:schema
npm run typecheck
npm run lint
npm run build
```
