# Tasks: Open tasks from entry checklists

**Input**: Design documents from `/specs/001-open-tasks/`

**Tests**: requested by the brief (API test additions + Playwright spec).

## Phase 1: Setup

- [X] T001 Start the isolated dev backend (`make up` with `pbn-tasks-*` names/ports in `.env`)

## Phase 2: Foundational (backend — blocks every story)

- [X] T002 Add `open_tasks` + `tasks` fields and index through the admin API; commit the generated migration in pb/migrations/
- [X] T003 Add `tasks(doc)` walker to pb/hooks/entry-validation.js
- [X] T004 Set `open_tasks`/`tasks` in `onRecordValidate` in pb/hooks/entries.pb.js
- [X] T005 Write SQL backfill migration in pb/migrations/ (no `updated`/`revision` bump)
- [X] T006 Regenerate src/services/pocketbase-types.ts with `make codegen`
- [X] T007 [P] API test: derivation, forging ignored, nested items, cross-account isolation in scripts/test-entries.ts
- [X] T008 [P] Seed a few tasks in scripts/seed-entries.ts

## Phase 3: User Story 1 — see every open task (P1) 🎯 MVP

**Independent test**: Open tasks lists only unchecked items, grouped by entry, newest first; empty state.

- [X] T009 [US1] Query (index fields only) in src/features/tasks/data.ts
- [X] T010 [US1] View with groups, links and empty state in src/features/tasks/open-tasks.tsx
- [X] T011 [US1] Route src/routes/_authenticated/entries.tasks.tsx; header title in src/features/entries/workspace.tsx
- [X] T012 [US1] "Open tasks" nav item in src/components/app-sidebar.tsx

## Phase 4: User Story 2 — tick from the list (P1)

**Independent test**: tick → entry saved checked; stale editor tab gets the conflict UI.

- [X] T013 [US2] `completeTask` (fetch one, flip at path, save with listed revision) in src/features/tasks/data.ts
- [X] T014 [US2] Checkbox + 409 handling + refresh in src/features/tasks/open-tasks.tsx

## Phase 5: User Story 3 — counts in the entry list (P2)

- [X] T015 [US3] Per-entry open count badge in src/components/app-sidebar.tsx

## Phase 6: Polish

- [X] T016 [P] Playwright spec (desktop + mobile, keyboard, conflict, isolation) in tests/e2e/tasks.spec.cjs
- [X] T017 [P] docs/TASKS.md
- [X] T018 `bun run lint`, `bun run build`, full e2e suite against `pbn-tasks` stack

## Dependencies

Phase 2 blocks all stories. US1 → US2 (same view). US3 only needs Phase 2. T016 needs US1–US3.

## Parallel examples

T007 ‖ T008 after T004; T015 ‖ T009–T012; T016 ‖ T017.

## Implementation strategy

MVP = Phase 2 + US1. Then US2 (the act-on-it half), US3, polish.
