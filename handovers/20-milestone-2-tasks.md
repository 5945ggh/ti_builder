# Milestone 2 Tasks

Milestone 2 goal: AI-assisted creation and scoring plus feedback and JSON export.

PRD acceptance anchors:

- Submit returns within 2 seconds with a response identifier and scoring status.
- Result page polls and displays `aiScoringStatus`.
- Open answers are scored concurrently, not by blocking the submit request.
- Open scoring output includes valid `deltaVector`, `confidence`, and `rationale`.
- AI output failure does not lose the response.
- Admin can trigger single-response rescoring.
- Settings page can test AI connectivity.
- JSON export includes questionnaire version, answers, scores, and feedback.

## M2-01 AI Client And Connection Self-Test

Build the server-only AI integration foundation.

Context:

- PRD sections 9.1, 9.5, 12.3.
- `handovers/00-architecture-and-contracts.md` AI contract.

Deliverables:

- `lib/ai/client.ts` marked server-only.
- Environment-based configuration.
- 60 second timeout.
- One retry for safe failures.
- `AiCallLog` writes for success and failure.
- Admin settings UI/API for connection self-test.

Acceptance:

- [ ] AI API key never reaches the browser bundle or client JSON.
- [ ] Self-test displays success/failure, model name, latency, and summarized error.
- [ ] Failed calls are logged without storing secrets.
- [ ] AI calls can target the configured base URL and model.

Verification:

- Run an AI self-test with valid config when credentials are available.
- Run self-test with intentionally invalid config and confirm safe error display.

## M2-02 AI Schema Draft Generation

Use AI to turn source text into a questionnaire schema draft.

Context:

- PRD sections 7.2, 9.1.

Deliverables:

- Admin action to paste source text and choose generation mode.
- Server API that calls AI and asks for questionnaire JSON.
- zod validation of the returned schema.
- Human confirmation step before writing into `currentDraftSchema`.
- Error UI that shows the raw AI output or a safe excerpt for manual repair.

Acceptance:

- [ ] AI-generated drafts are never published automatically.
- [ ] AI-generated drafts never overwrite current draft without explicit confirmation.
- [ ] Valid AI output can be accepted into the draft.
- [ ] Invalid AI output shows validation errors and the raw output for repair.
- [ ] Generation calls are logged in `AiCallLog`.

Verification:

- Manual flow with a small source text.
- Simulate invalid AI JSON and confirm recovery UI.

## M2-03 Async Open-Answer Scoring Worker And Polling

Implement database-backed async scoring.

Context:

- PRD sections 7.6, 9.2, 12.4, 15.3.
- `handovers/00-architecture-and-contracts.md` async scoring contract.

Deliverables:

- Submit path sets `aiScoringStatus = pending` for responses requiring AI scoring.
- Singleton worker started from Next.js `instrumentation.ts`.
- Claimed/processing state to prevent duplicate processing.
- Concurrent open-answer scoring with `Promise.allSettled`.
- Persisted per-question AI scoring results and errors.
- Status polling API.
- Result page status UI.

Acceptance:

- [ ] Submit API returns within 2 seconds without waiting for all AI calls.
- [ ] Result page polls scoring status.
- [ ] Open answers for one response are scored concurrently.
- [ ] Invalid AI JSON is retried once, logged, and then marked failed for that question.
- [ ] A failed open-answer score does not delete or lose the original response.
- [ ] Process restart leaves unfinished work discoverable by persisted status.

Verification:

- Manual or test-double flow with multiple open questions.
- Confirm concurrent behavior via logs/timing or controlled fake AI delays.
- Confirm failed AI output produces `partially_failed` or `failed` as appropriate.

## M2-04 Debug Interpretation

Generate internal debug interpretation after final vector calculation.

Context:

- PRD sections 7.7, 9.4, 15.5.

Deliverables:

- Debug prompt assembly from questionnaire title, dimensions, final vector, top/bottom dimensions, key choices, open answers, and AI scoring rationale.
- AI call after open-answer scoring.
- Persisted `debugInterpretation`.
- Result page rendering.

Acceptance:

- [ ] Debug interpretation runs only after final vector is available.
- [ ] Output includes readable explanation, result highlights, and instability/improvement signals.
- [ ] Prompt instructs the model not to present scientific diagnosis or deterministic school/career advice.
- [ ] Debug failures are recorded and do not erase scoring results.

Verification:

- Manual full response with open text.
- Inspect generated text for internal-test disclaimer and non-diagnostic wording.

## M2-05 Single-Response Rescoring

Allow admin users to rescore one response.

Context:

- PRD section 9.3.

Deliverables:

- Admin action on response detail page.
- Ability to rescore one open question or the full response if feasible.
- Recompute `perQuestionScores`, `finalVector`, and `debugInterpretation`.
- Preserve new and old AI call history through `AiCallLog`.

Acceptance:

- [ ] Admin can trigger rescoring for failed or questionable response scoring.
- [ ] Rescoring updates final vector consistently.
- [ ] Rescoring records AI calls and errors.
- [ ] Historical response answers remain unchanged.

Verification:

- Manual rescore of a response with one open answer.
- Confirm final vector changes when fake/stubbed AI score changes.

## M2-06 Feedback Form

Collect response-level feedback after result viewing.

Context:

- PRD sections 7.8, 10.5, 11.6.

Deliverables:

- Feedback form on result page.
- Fields for interest, accuracy, share willingness, usefulness, and comment.
- Reserved `questionComments` storage field without requiring per-question UI.
- Public token-safe feedback submit API.

Acceptance:

- [ ] Feedback scores are 1-5.
- [ ] Feedback belongs to exactly one response.
- [ ] External users can submit feedback only for their own result token.
- [ ] Duplicate or edited feedback behavior is explicit and implemented consistently.

Verification:

- Manual feedback submit from result page.
- API validation rejects out-of-range scores.

## M2-07 JSON Export

Export questionnaire and response data for analysis.

Context:

- PRD sections 7.9, 13 M2.

Deliverables:

- Admin JSON export endpoint or page action.
- Export includes questionnaire version, answers, per-question scores, final vector, AI debug interpretation, AI scoring data, and feedback.
- No API secrets in export.

Acceptance:

- [ ] JSON export contains enough data to reconstruct response interpretation.
- [ ] Export is admin-protected.
- [ ] Export includes immutable version snapshot.
- [ ] Export includes feedback when present.

Verification:

- Export a sample response and inspect JSON shape.
