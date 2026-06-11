# Milestone 3 Tasks

Milestone 3 goal: external testing, collaboration surfaces, safer result sharing, progress recovery, version comparison, filtering, and CSV export.

PRD acceptance anchors:

- Each published version can generate a random test link.
- Each test link has a response cap and rejects new submissions after the cap.
- External testers can access only answer, result, and feedback pages.
- External result pages use `resultToken`, not predictable IDs.
- External testers cannot see per-question contribution or open-answer `deltaVector` unless detail level is `detailed`.
- Version diff shows changes to questions, options, dimensions, and scoring vectors.
- Refresh during answering restores unsubmitted local answers.

## M3-01 External Test Token Flow

Harden and expose the external test-link flow.

Context:

- PRD sections 6.2, 7.6, 10.3, 13 M3.

Deliverables:

- `/t/[testToken]` page for external testers.
- Token lookup by published version.
- Token enabled/disabled handling.
- Response cap enforcement.
- Friendly full/disabled messages.
- Public submit API that authenticates only by token and returns only the submitted result token.

Acceptance:

- [ ] `testToken` is random and non-enumerable.
- [ ] Disabled token rejects new answers.
- [ ] Response cap rejects new answers after the limit.
- [ ] External submit cannot choose arbitrary `memberId`.
- [ ] External submit cannot access admin APIs.

Verification:

- Manual external answer flow.
- Cap test with a low limit.
- Attempt admin API access without admin session.

## M3-02 Result Token And Detail-Level Rendering

Enforce safe public result access and visibility.

Context:

- PRD sections 6.2, 7.7, 10.4, 13 M3.

Deliverables:

- `/r/[resultToken]` public result route.
- Public result API keyed by result token.
- Internal result route or mode with full details.
- `externalResultDetailLevel` handling.

Acceptance:

- [ ] Public result URLs use `resultToken`.
- [ ] Public result API returns only the addressed response.
- [ ] External `summary` mode hides per-question contribution and open-answer `deltaVector`.
- [ ] External `detailed` mode shows detailed scoring for trusted small tests.
- [ ] Internal members can view full details after admin authentication.

Verification:

- Manual public result flow in `summary` and `detailed`.
- Try invalid/random result token.
- Confirm no sequential response ID URL exposes data.

## M3-03 LocalStorage Progress Recovery

Protect mobile testers from losing unsubmitted answers.

Context:

- PRD sections 7.6, 11.5, 13 M3.

Deliverables:

- Draft answer persistence in `localStorage`.
- Restore prompt or automatic restore for the same test token/version.
- Clear saved progress after successful submit.
- Data keying that avoids cross-version contamination.

Acceptance:

- [ ] Refresh restores unsubmitted answers on the same device.
- [ ] Progress is scoped to the published version or test token.
- [ ] Submitted answers clear local saved progress.
- [ ] Old draft progress does not populate a different version.

Verification:

- Manual mobile-width/browser refresh flow.
- Submit then revisit page and confirm progress is cleared.

## M3-04 Version List And Diff

Help the team compare questionnaire iterations.

Context:

- PRD sections 7.5, 11.4, 13 M3.

Deliverables:

- Version list with version number, publish time, publisher, note, question count, dimension count, and response count.
- Diff UI for two versions.
- Use an existing JSON diff library if a dependency is warranted and approved by the project owner; otherwise start with a simple structured/text diff.

Acceptance:

- [ ] Version list shows required metadata.
- [ ] Diff reveals title/description changes.
- [ ] Diff reveals dimension changes.
- [ ] Diff reveals question additions/removals/edits.
- [ ] Diff reveals option label and `deltaVector` changes.
- [ ] Diff reveals open-question scoring prompt changes.

Verification:

- Publish two versions with known differences and inspect diff.

## M3-05 Data List, Filters, And Detail View

Build the admin response review surface.

Context:

- PRD sections 11.7, 14.

Deliverables:

- Response list.
- Filters for questionnaire, version, source, and member.
- Single response detail view.
- Summary metrics where easy: counts and average feedback scores.

Acceptance:

- [ ] Admin can filter response records by questionnaire.
- [ ] Admin can filter by version.
- [ ] Admin can filter by source.
- [ ] Admin can filter by member where present.
- [ ] Detail view shows answers, scores, debug interpretation, and feedback.

Verification:

- Seed or create several responses and exercise filters.

## M3-06 CSV Export

Add spreadsheet-friendly exports for response summaries and feedback.

Context:

- PRD sections 7.9, 13 M3.

Deliverables:

- Admin CSV export for response summaries.
- Admin CSV export for feedback scores/comments.
- Stable headers suitable for spreadsheet analysis.

Acceptance:

- [ ] CSV export is admin-protected.
- [ ] Response summary export includes questionnaire, version, source, respondent name, final vector, scoring status, created time, and result token.
- [ ] Feedback export includes all four scores and comment.
- [ ] CSV escaping handles commas, quotes, and newlines.

Verification:

- Export data containing commas/newlines and open in a spreadsheet-compatible viewer.
