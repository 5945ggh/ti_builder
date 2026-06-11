# Agent Session Template

Copy this into each implementation prompt and fill the blanks.

## Task

Implement: `<single task name>`.

Milestone: `<M1 | M2 | M3>`.

## Required Context

Read first:

- `docs/prd-test-workbench.md`, sections `<section numbers>`.
- `handovers/00-architecture-and-contracts.md`.
- `handovers/<milestone-task-file>.md`, task `<task id>`.
- `lib/schema/questionnaire.ts` if it exists.

## Scope

Allowed to modify:

- `<paths>`

Do not modify:

- `<paths or modules outside this task>`

## Requirements

- `<requirement 1>`
- `<requirement 2>`
- `<requirement 3>`

## Acceptance Checklist

- [ ] `<testable acceptance item>`
- [ ] `<testable acceptance item>`
- [ ] `<testable acceptance item>`

## Verification

Run the smallest useful set:

- `<unit test command, if applicable>`
- `<typecheck/lint/build command, if applicable>`
- `<manual click path, if UI>`

## Commit Rule

One task, one commit. Before committing, inspect `git diff` and confirm no unrelated files changed.

Commit message must follow the repo Lore protocol from `AGENTS.md`.
