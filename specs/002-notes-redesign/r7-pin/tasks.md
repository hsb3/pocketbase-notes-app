# Tasks: R7 · Pin

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md), [data model](data-model.md), [contract](contracts/pin.md), [quickstart](quickstart.md)

**Tests**: Requested. The plan's [verification table](plan.md#verification-plan-mandatory) names a check for every requirement, so each story writes its checks first and records them failing on the predecessor commit before the implementation task.

**Containment**: Servers and browsers run only through `make test-api-contained`, `make test-browser-contained` or `bash scripts/run-contained.sh <suite>`, never on the host.

**Waves**: Phase 2 is plan waves W1 (schema) and W2 (API verb). Phases 3–5 split W2's list checks and W3 (UI) by story. Phase 6 is W4 (docs).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2 or US3 from [spec.md](spec.md)

---

## Phase 1: Setup

**Purpose**: Confirm the baseline the waves build on.

- [X] T001 Confirm the branch `r7-pin` sits on `b895d10` and that `bun run lint`, `bun run knip` and `bun run build` exit 0 before any R7 code change; record the exits as the predecessor baseline at the end of `specs/002-notes-redesign/r7-pin/tasks.md` (R7 gate evidence section, added in T029)

---

## Phase 2: Foundational (W1 schema, W2 pin verb)

**Purpose**: The `pinned` field, its guard rules and the one write path. Every story depends on these.

**⚠️ CRITICAL**: No story work starts until T009 passes.

### W1 · Schema

- [X] T002 Modify `scripts/test-r2-upgrade.sh` after its R5 stage (`r5 = "1795000400_active_notes_and_purge.js"`): copy in `1795000500_note_pins.js`, then run up, down, up. After each step assert rows are byte-equal, the notes field list, rules and indexes match [the data model](data-model.md#migration-and-rollback), and down restores the R5 create and update rule strings exactly. Add an unexpected-state control (pre-existing `idx_notes_user_pinned_updated_id`) that must make the migration throw and leave the snapshot unchanged. Run `make test-api-contained` (the api suite runs this script) on the predecessor and record it failing because the migration file is absent
- [X] T003 Create `pb/migrations/1795000500_note_pins.js` following the guard pattern of `pb/migrations/1795000400_active_notes_and_purge.js`. **Up**: assert the notes create and update rules equal the R5 strings and that `idx_notes_user_pinned_updated_id` does not exist; then add a bool field `pinned` (default `false`), the index `CREATE INDEX idx_notes_user_pinned_updated_id ON notes (user, pinned, updated, id)`, the createRule clause `@request.body.pinned:isset = false` and the updateRule clause `@request.body.pinned:changed = false` (both ANDed onto the existing rule). **Down**: assert the R7 state, then remove the field, index and both clauses. Either direction throws on unexpected state and changes nothing. No backfill
- [X] T004 Regenerate `src/services/pocketbase-types.ts` with `make codegen` (contained). Confirm `NotesRecord` gains `pinned: boolean` and a second run produces no diff. Never hand-edit this file
- [X] T005 Capture the SQL that PocketBase actually runs for the folder, All Notes and Pinned SDK list calls (dev query log), then record `EXPLAIN QUERY PLAN` for the folder (`-pinned,-updated,-id`), All Notes (`-pinned,-updated,-id`) and Pinned (`deleted = '' AND pinned = 1`, `-updated,-id`) list queries in `scripts/test-r2-upgrade.sh` output; expect the new index and no temporary sort on any of the three ([research §5](research.md#5-ordering-and-index)). Close W1 with the [W1 exit](quickstart.md#w1-exit)

### W2 · Pin verb

- [X] T006 Create `scripts/test-pins.ts` exporting one async case function (shape of `noteActions` in `scripts/test-note-actions.ts`: `(admin, ownerPb, draft)` plus a second account B and a guest client). Cover the write rows of the [W2 exit table](quickstart.md#w2-exit): pin then unpin returns 200 with exactly `id, user, folder, deleted, revision, pinned` and leaves `revision`, `updated`, `body`, `title`, `text`, `search_key`, `tasks`, `open_tasks`, `folder`, `deleted` and `attachments` unchanged (before/after row compare); same-value pin returns 200 with the row unchanged; a string `pinned`, a missing `pinned` or an extra key such as `revision` returns 400 with the row unchanged; pinning a deleted note returns 400; B gets 404 with the same message as a missing ID and the guest gets 401, row unchanged; ordinary create with any `pinned` key and PATCH changing `pinned` are refused and the stored value is unchanged; a new note reads `pinned: false`
- [X] T007 In `scripts/test-pins.ts` add the concurrency rows: client 1 pins, then client 2 saves a body with the revision read before the pin → pin 200, save 200 (no 409), stored pin still true; clients 1 and 2 set true then false in sequence → the last request received wins
- [X] T008 Modify `scripts/test-notes.ts` to import the case from `scripts/test-pins.ts` and call it in the same case loop that calls `noteActions` (around line 1253). Run `make test-api-contained` on the W1 commit and record the pin cases failing (router 404 for `/pin`)
- [X] T009 Modify `pb/hooks/note-actions.pb.js`: register `pin` as its own route handler, outside the move/delete/restore loop, so it has its own `{ pinned }`-only key check and never reaches the shared revision check or 409 path. `ownedNote` in `pb/hooks/note-lifecycle.js` stays unchanged: the staged upgrade runs current hooks against the R5 schema, which has no `pinned` column. Add `POST /api/notebook/notes/{id}/pin` per [the contract](contracts/pin.md#api). Reuse the existing users-auth binding, private no-store response, owner check, raw `deleted` date check (corrupt value → 500) and transaction. Accept a JSON object with exactly the key `pinned` holding a JSON boolean; anything else → 400. Inside the transaction re-read owner and state; a deleted note → 400; foreign or missing → 404 with one message. Run the single bound `UPDATE notes SET pinned={:pinned} WHERE id={:id} AND user={:user} AND deleted='' AND pinned<>{:pinned}`; zero affected rows means the value already matched, so nothing is written and the reply is still 200. Never read, check or change `revision` (constitution III 2.0.0). Move, delete and restore keep their R5 projection and SQL. Pass `make test-api-contained` ([W2 exit](quickstart.md#w2-exit))

**Checkpoint**: The server stores, guards and writes `pinned`; stories can start.

---

## Phase 3: User Story 1 · Pin a note to the top of its folder (P1) 🎯 MVP

**Goal**: One Pin / Unpin action in the note actions; folder lists and All Notes show pinned notes first with a marker.

**Independent test**: In a folder with three notes, pin the oldest: it moves to the top with the marker. Unpin it: it returns to its recency position.

### Tests for User Story 1

- [X] T010 [US1] In `scripts/test-pins.ts` add the list-order rows: folder and All Notes lists sorted `-pinned,-updated,-id` put pinned rows first, each group most recently edited first (spec Story 1.1–1.3); editing pinned D moves it above pinned C within the pinned group; if every note in a folder is pinned the list is one group in recency order; search order stays `-updated,-id` and ignores pins; a second SDK client of A reads the same order (Story 1.4); B's lists contain none of A's notes or pins
- [X] T011 [P] [US1] Create `tests/e2e/pin.spec.cjs` using `tests/e2e/fixtures.cjs` and `tests/e2e/note-helpers.cjs`, at 390, 810 and 1440 px in Chromium and WebKit. Cover [W3 exit](quickstart.md#w3-exit) steps 1, 2, 6 and 7: Pin from the note actions announces "Pinned.", returns focus to `#note-actions`, keeps URL and draft, and C shows first with the marker (accessible text "Pinned") within 1 s of the acknowledgement (SC-002); typing straight after pinning reaches Saved, and a second context that had the note open also reaches Saved with no conflict dialog; aborting the pin reply after commit shows "Could not pin this note. Try again.", and Retry leaves the note pinned once with no conflict; keyboard-only open, Pin, Escape; zero horizontal page scroll; captures in both themes. Run on Phase 2's commit and record the failures (no Pin item)

### Implementation for User Story 1

- [X] T012 [P] [US1] Modify `src/features/notes/data.ts`: add `pinned` to `listNotes` `fields` and change its sort to `-pinned,-updated,-id`; add `pinned` to `getNote`'s `detailFields` and the validated `Detail` shape. Leave `searchNotes` unchanged
- [X] T013 [P] [US1] Modify `src/features/notes/actions.ts`: add `setPin(id, pinned, session)` that posts `{ pinned }` to `/api/notebook/notes/{id}/pin` with the same private, uncached request options as the R5 actions, and accepts the reply only when it has the same owner and note ID and `pinned === requested`. Do not use `NoteCommand`, `confirms`, revision adoption or "Check again"
- [X] T014 [US1] Modify `src/features/notes/note-actions.tsx`: add one Pin / Unpin item (lucide `Pin` icon) labelled from the note's current `pinned`, disabled while its request is in flight. On success update local `pinned`, refresh the list, announce "Pinned." or "Unpinned." and return focus to `#note-actions`. On network error, timeout or 5xx keep the old state and show "Could not pin this note. Try again." with Retry resending the same absolute value. A 404 uses R5's missing-note handling; a 400 for a deleted note refreshes the note (depends on T013)
- [X] T015 [US1] Modify `src/features/notes/workspace.tsx` to hold the open note's `pinned` beside the draft (not in its save baseline, so autosave and revision are untouched) and pass it and the list refresh to the note actions (depends on T012, T014)
- [X] T016 [US1] Modify `src/features/notes/note-list.tsx` so a pinned row shows a `Pin` icon with accessible text "Pinned"; reuse the existing row layout. Pass `scripts/test-pins.ts` list rows via `make test-api-contained` and `tests/e2e/pin.spec.cjs` via `make test-browser-contained`

**Checkpoint**: Pin works in folders and All Notes; MVP deliverable.

---

## Phase 4: User Story 2 · See every pinned note in one Pinned view (P2)

**Goal**: A Pinned smart folder lists each active pinned note once with its folder name.

**Independent test**: Pin one note in Notes and one in Garden; Pinned shows both once, labelled with their folders; editing one keeps it there.

### Tests for User Story 2

- [X] T017 [US2] In `scripts/test-pins.ts` add the Pinned rows: the filter `deleted = "" && pinned = true` sorted `-updated,-id` lists each active pinned note of A exactly once across folders, most recently edited first; B's Pinned read is empty
- [X] T018 [US2] In `tests/e2e/pin.spec.cjs` add [W3 exit](quickstart.md#w3-exit) steps 3 and 4: Pinned shows C once with its folder name; unpinning C from Pinned removes it from the list and leaves it in its folder; the empty state reads "No pinned notes" with "Pin a note from its actions menu."; opening a pinned note from Pinned and editing it keeps it in Pinned; composing from Pinned files the new note in Notes, unpinned. Record the failures on Phase 3's commit

### Implementation for User Story 2

- [X] T019 [US2] Modify `src/features/notes/data.ts` so `listNotes("pinned", page)` filters `deleted = "" && pinned = true` and sorts `-updated,-id`
- [X] T020 [P] [US2] Modify `src/features/folders/folder-list.tsx`: add a "Pinned" item (lucide `Pin` icon) with pseudo-folder ID `pinned` between All Notes and the real folders
- [X] T021 [US2] Modify `src/features/notes/workspace.tsx` to route the `pinned` pseudo-folder like `all` (compose files in the default folder, unpinned) and `src/features/notes/note-list.tsx` to show each row's folder name in the Pinned view (the line used for search hits) and the Pinned empty state. Pass `make test-api-contained` and `make test-browser-contained`

**Checkpoint**: Stories 1 and 2 work independently.

---

## Phase 5: User Story 3 · Pin survives move, delete and restore (P3)

**Goal**: Prove R5 actions preserve `pinned` and that deleted notes never show in Pinned. Research §7 expects no code change.

**Independent test**: Pin a note, move it, delete it, check Pinned, restore it, check Pinned again.

- [X] T022 [US3] In `scripts/test-pins.ts` add the survival rows: pin → move → delete → restore keeps `pinned` true at every step; while deleted the note is absent from Pinned and every folder list; deleting a folder holding a pinned note, then restoring the note, returns it pinned in Notes; after restore it appears once in Pinned
- [X] T023 [US3] In `tests/e2e/pin.spec.cjs` add [W3 exit](quickstart.md#w3-exit) step 5: pin, move, delete, restore through the UI; absent from Pinned while deleted, present once after restore, at the top of its new folder
- [X] T024 [US3] Run `make test-api-contained` and `make test-browser-contained`. If any survival row fails, fix the root cause in `pb/hooks/note-actions.pb.js` or `pb/hooks/folders.pb.js` without touching their revision rules; otherwise record that no code change was needed

**Checkpoint**: All three stories pass.

---

## Phase 6: Polish (W4 docs and gate)

- [X] T025 [P] Modify `docs/features/notes.md` to describe Pin / Unpin, pinned ordering, the marker, that a pin is not an edit and never conflicts with a save
- [X] T026 [P] Modify `docs/features/folders.md` to describe the Pinned smart folder, its empty state and compose-from-Pinned filing
- [X] T027 [P] Add an Unreleased entry for Pin to `CHANGELOG.md`
- [X] T028 Run `python3 scripts/ai-context.py check` and `bun run docs:build`; fix any failure ([W4 exit](quickstart.md#w4-exit))
- [ ] T029 Run the full gate `.specify/extensions/functionform-gate/scripts/gate.sh full`. Append an "R7 gate evidence" section to `specs/002-notes-redesign/r7-pin/tasks.md` (shape of the R5 ledger): tested commits, red and green commands with exits, EXPLAIN plans, capture paths, and `docker ps -a` showing no leftover containers. Mark only demonstrated tasks
- [ ] T030 Modify `specs/002-notes-redesign/versions.md` last: set the R7 row to `done` once T029 is green

---

## Dependencies

- **Phase 1 → Phase 2 → stories.** T002–T005 (W1) before T006–T009 (W2). T009 blocks every story.
- **US1 (P1)** depends only on Phase 2.
- **US2 (P2)** depends on Phase 2 and on US1's `data.ts` fields (T012) and `pinned` row data; its UI is otherwise independent.
- **US3 (P3)** depends on Phase 2 for the API rows and on US1's Pin item for the browser rows.
- **Polish** after all stories.
- `scripts/test-pins.ts`, `tests/e2e/pin.spec.cjs`, `data.ts`, `workspace.tsx` and `note-list.tsx` are edited by several tasks: run those tasks in ID order, never in parallel.

## Parallel opportunities

- **Phase 2:** none; each task feeds the next.
- **US1:** T011 (browser test) alongside T010; then T012 (`data.ts`) and T013 (`actions.ts`) together.
- **US2:** T020 (`folder-list.tsx`) alongside T019.
- **Polish:** T025, T026 and T027 together.

```text
# US1 after T010
T011 tests/e2e/pin.spec.cjs   ║ T012 src/features/notes/data.ts ║ T013 src/features/notes/actions.ts
```

## Implementation strategy

1. **MVP:** Phases 1–3. Pin in folders and All Notes, proven by API and browser tests. Stop and check here.
2. **Add US2:** the Pinned view.
3. **Add US3:** survival proof; expect tests only.
4. **Polish:** docs, gate, evidence, `versions.md`. One PR to `main` for the increment, linking [issue 42](https://github.com/hsb3/pocketbase-notes-app/issues/42).
