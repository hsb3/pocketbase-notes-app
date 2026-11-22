# Tasks: R8 · Journal smart folder

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md), [data model](data-model.md), [contract](contracts/journal.md), [quickstart](quickstart.md)

**Tests**: Requested. The plan's [verification table](plan.md#verification-plan-mandatory) names a check for every requirement, so each phase writes its checks first and records them failing on the predecessor commit before the implementation task.

**Containment**: Servers and browsers run only through `make test-api-contained`, `make test-browser-contained`, `CONTAINED_PROFILE=default bash scripts/run-contained.sh codegen` or `bash scripts/run-contained.sh <suite>`, never on the host. Stop nothing you did not start. The owner's `pocketbase-notes` stack (port 8100) stays untouched. Host-only checks: `bun run lint`, `bun run knip`, `bun run build`, `bun test tests/unit`, `bun x tsc -p scripts/tsconfig.json`, `python3 scripts/ai-context.py check`, `bun run docs:build`.

**Waves**: Phase 2 is plan waves W1 (schema) and W2 (date verb and notices). Phases 3–5 are W3 (UI) split by story, with Phase 5 also holding W4 (survival). Phase 6 is W5 (docs and gate). Commit once per wave, as [CONTRIBUTING.md](../../../CONTRIBUTING.md) requires.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2 or US3 from [spec.md](spec.md)

---

## Phase 1: Setup

**Purpose**: Confirm the baseline the waves build on.

- [X] T001 Confirm branch `r8-journal` sits on `099dd07` plus the design commit, and that `bun run lint`, `bun run knip`, `bun run build` and `bun test tests/unit` exit 0 before any R8 code change. Record the exits as the predecessor baseline in the "R8 gate evidence" section at the end of `specs/002-notes-redesign/r8-journal/tasks.md` (added in T036)

---

## Phase 2: Foundational (W1 schema, W2 date verb and notices)

**Purpose**: The `journal_date` field, its guard rule, create validation, the one write path and its notice. Every story depends on these.

**⚠️ CRITICAL**: No story work starts until T011 passes.

### W1 · Schema

- [X] T002 Modify `scripts/test-r2-upgrade.sh` after its R7 stage (`r7 = "1795000500_note_pins.js"`): copy in `1795000600_note_journal_dates.js`, then run up, down, up. After each step assert rows are byte-equal apart from `journal_date = ''`; the field is `("text", False)` with `max` 10 and pattern `^\d{4}-\d{2}-\d{2}$`; every other field equals the R7 list; the create rule equals the R7 create rule unchanged; the update rule equals the R7 update rule plus `' && @request.body.journal_date:changed = false'`; indexes equal R7's plus ``CREATE INDEX `idx_notes_user_journal_date_updated_id` ON `notes` (user, journal_date, updated, id)``, not partial (`PRAGMA index_xinfo` columns `user, journal_date, updated, id`); down restores the R7 snapshot exactly. Add the unexpected-state control (a pre-existing `idx_notes_user_journal_date_updated_id` on `(user, updated)` must make up throw and leave the snapshot unchanged). With the server up on the R8 schema, assert: a PATCH changing `journal_date` is refused (404 under the update rule) and the value is unchanged; a create with `journal_date: "2026-02-31"` is 400 and creates nothing; a create with `"2026-11-21"` stores it; a create without the key stores `""` (proves the field pattern skips empty values). Make sure the staged hook copy list includes every hook the current `notes.pb.js` requires (LU found a missing `note-notice.js` there). Run `make test-api-contained` on the predecessor and record it failing because the migration file is absent
- [X] T003 Create `pb/migrations/1795000600_note_journal_dates.js` following the guard pattern of `pb/migrations/1795000500_note_pins.js`. **Up**: assert the notes create and update rules equal the R7 strings (R5 strings plus the two `pinned` clauses), that `journal_date` does not exist and that `idx_notes_user_journal_date_updated_id` does not exist; then add `new TextField({ name: "journal_date", max: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })` (not required), `notes.addIndex("idx_notes_user_journal_date_updated_id", false, "user, journal_date, updated, id", "")` and AND `@request.body.journal_date:changed = false` onto the update rule. Leave the create rule unchanged. **Down**: assert the R8 state, then remove the index, the field and the clause. Already-applied state returns without change; any other state throws and changes nothing. No backfill
- [X] T004 Modify `pb/hooks/entry-validation.js`: replace `date(kind, value)` with `date(value)` that accepts `""` and otherwise keeps the existing check (`/^\d{4}-\d{2}-\d{2}$/`, `value >= "0001-01-01"`, `Date.parse` finite, ISO round trip), throwing "Choose a valid journal date." Modify `onRecordValidate` in `pb/hooks/notes.pb.js` to call `validate.date(note.getString("journal_date"))` inside the existing try block so an invalid day is a 400 ([research §1](research.md#1-field-shape-a-date-only-text-field))
- [X] T005 Regenerate `src/services/pocketbase-types.ts` with `CONTAINED_PROFILE=default bash scripts/run-contained.sh codegen`. Confirm `NotesRecord` gains `journal_date?: string` and a second run produces no diff. Never hand-edit this file
- [X] T006 In the R8 stage of `scripts/test-r2-upgrade.sh`, capture from the dev query log the SQL PocketBase runs for two SDK list calls as a user (Journal: filter `deleted = "" && journal_date != ""`, sort `-journal_date,-updated,-id`; one day: filter `deleted = "" && journal_date = "2026-11-21"`, sort `-updated,-id`), plus the R7 folder, All Notes and Pinned shapes. Record `EXPLAIN QUERY PLAN` for each. Assert the two Journal plans use `idx_notes_user_journal_date_updated_id` (the day plan with `journal_date=?`) and contain no `TEMP B-TREE`, and the R7 plans are unchanged. If the Journal plan has a temporary sort, switch the filter to `journal_date > ""`, re-run, and record which filter shipped in the evidence and in `data-model.md` ([research §5](research.md#5-index-and-the-real-list-sql)). Close W1 with the [W1 exit](quickstart.md#w1-exit)

### W2 · Date verb and notices

- [X] T007 Create `scripts/test-journal.ts` exporting one async case function (shape of `scripts/test-pins.ts`: owner client, a second client of the same owner, account B and a guest). Cover the write rows of the [W2 exit table](quickstart.md#w2-exit): set, change, remove a day → 200 with exactly `id, user, folder, deleted, revision, journal_date`, and `revision`, `updated`, `created`, `body`, `title`, `text`, `search_key`, `tasks`, `open_tasks`, `folder`, `deleted`, `pinned` and `attachments` unchanged (before/after superuser row compare); same-value → 200, row unchanged; `0001-01-01` and `9999-12-31` accepted; `2026-02-31`, `2026-1-5`, `10000-01-01`, a number, `null`, a missing key and an extra key such as `revision` → 400, row unchanged; a query string or a non-JSON content type → 400; a deleted note → 400; B → 404 with the same message as a missing ID; guest → 401; ordinary PATCH changing `journal_date` refused, value unchanged; ordinary create with a valid day, with `""` and without the key stores it, `""` and `""`; with an invalid day → 400 and no row
- [X] T008 In `scripts/test-journal.ts` add the concurrency rows: client 1 dates the note, then client 2 saves a body with the revision read before → date 200, save 200 (no 409), stored day kept; clients 1 and 2 set different days in sequence → the last request received wins
- [X] T009 Modify `scripts/test-live-updates.ts`: the create and save notice expectations gain `journal_date: ""` (the case uses `assert.deepEqual`); add rows: one notice per date change to A1 with exactly `id, folder, deleted, revision, journal_date` holding the post-write values, including a same-value change; a refused date change (400, 404) sends nothing; B, the guest and the superuser client receive zero notices. Modify `scripts/test-notes.ts` to import the case from `scripts/test-journal.ts` and call it in the case loop beside `"note pins"`. Run `make test-api-contained` on the W1 commit and record the journal and notice rows failing (router 404 for `/date`; notices lack `journal_date`)
- [X] T010 Modify `pb/hooks/note-actions.pb.js`: turn the pin route into a loop over `["pin", "date"]` registering `POST /api/notebook/notes/{id}/<verb>`. Inside the handler read the verb from `e.request.url.path` (Goja compiles each callback in isolation, so it cannot capture the loop variable). The verb fixes the key (`pinned` or `journal_date`), the value check (`typeof === "boolean"`, or a string passing `require(`${__hooks}/entry-validation.js`).date`, with its error mapped to 400) and the column name from a fixed map, never from input. Keep every R7 guard unchanged: users-auth binding, private no-store header, 15-character ID check, body read before the transaction, exactly one key, JSON media type, no query string, owner re-read, raw `deleted` check (corrupt → 500), deleted → 400, foreign or missing → 404. Run one bound `UPDATE notes SET <column>={:value} WHERE id={:id} AND user={:user} AND deleted='' AND <column><>{:value}`; zero rows → same value, still 200. Reply `{ id, user, folder, deleted: "", revision, <key> }`. Never read, check or change `revision` (constitution III 2.0.0). `ownedNote` in `pb/hooks/note-lifecycle.js` stays unchanged. Move, delete and restore are untouched
- [X] T011 Modify `pb/hooks/note-notice.js` to add `journal_date` to the payload when `typeof note.journal_date === "string"`, and `noticeSaved` in `pb/hooks/notes.pb.js` to pass `journal_date: e.record.getString("journal_date")`. The date verb sends its result after `runInTransaction` returns, as pin does. Update the payload comment in `specs/003-live-updates/contracts/notice.md` and `specs/003-live-updates/data-model.md` to point to the [R8 notice addition](contracts/journal.md#change-notice). Pass `make test-api-contained` and `bun test tests/unit` ([W2 exit](quickstart.md#w2-exit))

**Checkpoint**: The server stores, guards, writes and announces `journal_date`. Commit W1 (T002–T006) and W2 (T007–T011) separately.

---

## Phase 3: User Story 1 · Give a note a journal date and see it in Journal (P1) 🎯 MVP

**Goal**: One date action in the note actions; a Journal smart folder grouped by day.

**Independent test**: Date a Notes note and a Garden note yesterday; Journal shows both under one heading with their folders; removing one date takes it out of Journal only.

### Tests for User Story 1

- [ ] T012 [US1] In `scripts/test-journal.ts` add the list rows: Journal (filter from T006, sort `-journal_date,-updated,-id`) lists each active dated note of A exactly once across folders, newest day first, most recently edited first within a day, pinned notes not lifted; undated and deleted notes absent; folder, All Notes and Pinned order and Search order and projection unchanged from R7/R4; B's Journal read is empty
- [ ] T013 [US1] Create `tests/e2e/journal.spec.cjs` using `tests/e2e/fixtures.cjs` and `tests/e2e/note-helpers.cjs`, at 390, 810 and 1440 px in Chromium and WebKit. Cover [W3 exit](quickstart.md#w3-exit) steps 1, 2, 4 and 9, computing "yesterday" from a clock fixed with `page.clock.setFixedTime` so the day cannot roll over mid-test: "Add date…" opens the "Journal date" dialog; fill yesterday and Save → "Date set." announced, focus on `#note-actions`, URL and draft unchanged, header shows the formatted day within 1 s of the acknowledgement (SC-002), typing straight after reaches Saved; a second note in another folder with the same day; Journal shows one heading with both rows and their folder names, both still in their folders; "Change date…" → Remove date → "Date removed.", the note leaves Journal and stays in its folder; Journal empty state "No journal notes" / "Add a date from a note's actions menu."; Escape and Cancel change nothing and return focus; keyboard-only path; zero horizontal page scroll; captures `journal-days`, `journal-empty` and `date-dialog` in both themes to `/tmp/r8-views/<engine>-<width>-<theme>-<state>.png`. Independent superuser reads confirm `revision` and `updated` unchanged by each date change
- [ ] T014 [US1] Add profile `journal` to `scripts/run-contained.sh`, mirroring `pin`: add `browser/journal` to the allowed list and the report branch, `mkdir -p /tmp/r8-views`, run `tests/e2e/journal.spec.cjs --workers=1 --retries=0`, copy `journal.json` and `r8-views`, extend the report check's expected set to `{"journal.spec.cjs"}` for `journal`, and require the states `journal-days journal-day-empty journal-empty date-dialog` per engine, width and theme. Run `make test-browser-contained CONTAINED_PROFILE=journal` on the W2 commit and record the failures (no date action)

### Implementation for User Story 1

- [ ] T015 [P] [US1] Modify `src/features/notes/data.ts`: restore `localDate()` and `validDate()` verbatim from `git show 2e99d29^:src/features/entries/data.ts`; add `journal_date` to `detailFields`, `Detail`, the `getNote` validation (`""` or `validDate()`), and the `listNotes` `fields`; add `listNotes("journal", page, day?)` per [the contract](contracts/journal.md#client-reads), binding `day` through `pb.filter`; leave `searchNotes` unchanged. Update `tests/unit/note-draft.test.cjs` and `tests/e2e/notes.spec.cjs` expectations for the new list and detail fields
- [ ] T016 [P] [US1] Modify `src/features/notes/actions.ts`: add `setJournalDate(id, user, journal_date, session)` beside `setPin`, posting `{ journal_date }` to `/api/notebook/notes/{id}/date` with `privateRead(session)`, accepting the reply only for the same owner and note with `journal_date === requested`, otherwise throwing "Unconfirmed date."
- [ ] T017 [P] [US1] Create `src/features/notes/journal-date.tsx` exporting the date dialog ([contract UI](contracts/journal.md#ui), [research §8](research.md#8-date-control-without-a-new-dependency)): existing `Dialog` titled "Journal date", `<input type="date">` labelled "Journal date" with `min="0001-01-01"` and `max="9999-12-31"`, pre-filled with the current day or `localDate()`; Today sets `localDate()`; Remove date shown only for dated notes; Save disabled unless `validDate()`; Cancel and Escape change nothing. Also export `formatDay(day)` using `new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })`, never parsing the bare day
- [ ] T018 [US1] Modify `src/features/notes/note-actions.tsx`: add one "Add date…" / "Change date…" item (lucide `CalendarDays`) shown with Pin, disabled while its request is in flight, opening the T017 dialog with focus handed off like Move; show `formatDay(journal_date)` beside the folder name when dated; show "Could not change the date. Try again." with Retry resending the same absolute value after a failure (depends on T017)
- [ ] T019 [US1] Modify `src/features/notes/workspace.tsx`: hold the open note's day beside the draft as `{ id, journal_date, busy?, retry? }` (never in its save baseline), set from `getNote` on open and from compose; add `changeDate(value)` mirroring `togglePin` (on success update the day, `refreshList()`, announce "Date set." or "Date removed.", focus `#note-actions`; 404 → `missing(note)`; 400 → re-read; else keep the old day and set `retry`); route the `journal` pseudo-folder like `pinned` (title "Journal", compose target the default folder); pass the day state and handler to `NoteActions` (depends on T015, T016, T018)
- [ ] T020 [US1] Modify `src/features/notes/note-list.tsx` so the Journal view renders a day heading (`formatDay`) before the first row of each day on the page, shows each row's folder name on the line Pinned uses, keeps the pin marker, and shows the Journal empty state; modify `src/features/folders/folder-list.tsx` to add "Journal" (lucide `CalendarDays`) with pseudo-folder ID `journal` between Pinned and the real folders. Pass `make test-api-contained` and `make test-browser-contained CONTAINED_PROFILE=journal` for the T012–T013 rows

**Checkpoint**: Dating and Journal work; MVP deliverable.

---

## Phase 4: User Story 2 · Filter Journal to one day (P2)

**Goal**: A `?day=` filter, and compose from Journal that carries the day.

**Independent test**: Notes on three days; filter to the middle day; clear; compose from the filtered view.

### Tests for User Story 2

- [ ] T021 [US2] In `scripts/test-journal.ts` add the day rows: the one-day filter lists only that day's active notes, `-updated,-id`; an empty day returns zero rows; B's day read is empty
- [ ] T022 [US2] In `tests/e2e/journal.spec.cjs` add [W3 exit](quickstart.md#w3-exit) steps 3 and 5: three days newest first; "Filter by day" to the middle day shows only its notes and sets `?day=`; reload and Back from an opened note keep it; Clear shows all three; an empty day shows "No notes on {day}" with Clear day (capture `journal-day-empty`); `/folders/journal?day=2026-02-31` shows unfiltered Journal; searching from Journal returns global results and clearing the search returns to Journal with `day` kept; opening, filtering, clearing and leaving Journal without typing leaves the owner's note count unchanged (superuser count before and after); compose from the filtered view and type → the note is in Notes with the filtered day; compose with no filter → `localDate()`. Record the failures on Phase 3's commit

### Implementation for User Story 2

- [ ] T023 [US2] Modify `src/routes/_authenticated/_library.folders.$folderId.tsx` `validateSearch` to add `day?: string`, kept only when `validDate()` accepts it; modify `src/features/notes/note-list.tsx` (`ListPosition` gains `day`; the Journal header gets a "Filter by day" date input and Clear; the filtered empty state) and `src/features/notes/workspace.tsx` (`selectFolder` and `back` carry `day`; the `NoteList` key includes it; the list passes `day` to `listNotes`)
- [ ] T024 [US2] Modify `src/features/notes/draft.ts` so `NoteDraft` takes an optional `journalDate` used only in the create body and kept through `suspend()`/held drafts (`src/features/notes/suspended-draft.ts` stores the suspend result unchanged); modify `saveNote` in `src/features/notes/data.ts` to send `journal_date` on create only and require the reply to echo it; modify `compose` in `src/features/notes/workspace.tsx` so compose from `journal` passes `day || localDate()` and sets the held day state. Extend `tests/unit/note-draft.test.cjs` for the create body with and without a day and for a held draft keeping it. Pass `make test-api-contained` and `make test-browser-contained CONTAINED_PROFILE=journal`

**Checkpoint**: Stories 1 and 2 work independently.

---

## Phase 5: User Story 3 · The date holds across time zones, devices and recovery (P3)

**Goal**: No time zone shift; live follow on other devices; survival through R5 actions (plan wave W4).

**Independent test**: Date in Kiritimati, read in Pago Pago; change on one device, see it on the other; move, delete, restore.

### Tests for User Story 3

- [ ] T025 [US3] In `tests/e2e/journal.spec.cjs` add [W3 exit](quickstart.md#w3-exit) step 6: contexts with `timezoneId: "Pacific/Kiritimati"` and `timezoneId: "Pacific/Pago_Pago"`, each with `page.clock.setFixedTime("2026-11-21T11:30:00Z")`. Compose from Journal and type in each: stored days are `2026-11-22` (Kiritimati) and `2026-11-21` (Pago Pago) by superuser read. A note dated `2026-11-21` in Kiritimati shows 21 November in Pago Pago in the header and under the Journal heading, and `?day=2026-11-21` lists it in both (SC-004)
- [ ] T026 [US3] In `tests/e2e/journal.spec.cjs` add steps 7 and 8: two contexts of A with the note open; context 1 changes the day; context 2's header and Journal list show it within 2 s and context 2 keeps typing to Saved with no conflict dialog (SC-002, SC-005); with realtime blocked in context 1 (`**/api/realtime` aborted through the shared `blockRealtime` helper, as LU T020 did for the lost pin reply), abort its `/date` reply after the server commits → "Could not change the date. Try again.", Retry leaves the chosen day, no conflict; with realtime on, the same aborted reply is settled by the note's own notice and the header shows the chosen day without Retry. Record the failures on Phase 4's commit (context 2 drops the notice as an echo)
- [ ] T027 [US3] In `scripts/test-journal.ts` add the survival rows: date → pin → move → delete → restore keeps `journal_date` byte-equal at every step; while deleted the note is absent from Journal and the day filter; deleting a folder holding a dated note, then restoring the note, returns it dated in Notes; after restore it appears once in Journal
- [ ] T028 [US3] In `tests/e2e/journal.spec.cjs` add the [W4 exit](quickstart.md#w4-exit) row: with Journal open, date, move, delete and restore through the owner API; the note is absent while deleted and present once with its day after restore

### Implementation for User Story 3

- [ ] T029 [US3] Modify `src/features/notes/live.ts` `parse()` to accept an optional `journal_date` that is `""` or passes `validDate()` (drop the notice otherwise); modify `NoteDraft.isEcho` in `src/features/notes/draft.ts` to take the held day and treat a notice as an echo only when `journal_date` is absent or equal; modify `followRemote` in `src/features/notes/workspace.tsx` to pass the held day, defer while the day request is busy (as for `pin.busy`), and set the day from the fresh read like the pin. Extend `tests/unit/note-draft.test.cjs` for `isEcho` with an equal, a different and an absent `journal_date`
- [ ] T030 [US3] Run `make test-api-contained` and `make test-browser-contained CONTAINED_PROFILE=journal`. If a survival row fails, fix the root cause in `pb/hooks/note-actions.pb.js` or `pb/hooks/folders.pb.js` without touching their revision rules; otherwise record that no code change was needed. Run `make test-browser-contained CONTAINED_PROFILE=live` and `CONTAINED_PROFILE=pin` to show LU and R7 still pass

**Checkpoint**: All three stories pass. Commit W3 (T012–T026, T029) and W4 (T027, T028, T030), or one wave commit if the survival rows needed no code.

---

## Phase 6: Polish (W5 docs and gate)

- [ ] T031 [P] Modify `docs/features/notes.md` to describe the date action, that a date is a calendar day with no time zone, that it is not an edit and never conflicts with a save, and that it follows to other devices
- [ ] T032 [P] Modify `docs/features/folders.md` to describe the Journal smart folder, its order and headings, the day filter and its address, the empty states and compose-from-Journal filing and dating
- [ ] T033 [P] Modify `docs/testing/verification.md` to add the `journal` profile row and a "Journal" section (shape of "Pin"), and add an Unreleased entry for Journal to `CHANGELOG.md`
- [ ] T034 If the Needs-owner decision on the calendar grid ([plan](plan.md#needs-owner)) has been made, record it in `research.md` §8; otherwise leave the provisional default and list it in the pull request as open
- [ ] T035 Run `python3 scripts/ai-context.py check`, `bun run docs:build` and `bun x tsc -p scripts/tsconfig.json`; fix any failure ([W5 exit](quickstart.md#w5-exit))
- [ ] T036 Run the full gate `.specify/extensions/functionform-gate/scripts/gate.sh full`. Append an "R8 gate evidence" section to `specs/002-notes-redesign/r8-journal/tasks.md` (shape of the R7 and LU ledgers): tested commits, red and green commands with exits, the EXPLAIN plans and which Journal filter shipped, the time-zone and two-device timings, capture paths, deviations from the task text, and `docker ps -a` showing no leftover containers. Mark only demonstrated tasks
- [ ] T037 Modify `specs/002-notes-redesign/versions.md` last: set the R8 row to `done` once T036 is green

---

## Dependencies

- **Phase 1 → Phase 2 → stories.** T002–T006 (W1) before T007–T011 (W2). T011 blocks every story.
- **US1 (P1)** depends only on Phase 2.
- **US2 (P2)** depends on Phase 2 and on US1's `data.ts`, `workspace.tsx` and `note-list.tsx` Journal routing (T015, T019, T020).
- **US3 (P3)** depends on Phase 2 for the API rows and on US1's date action for the browser rows; T025 uses US2's compose from Journal (T024).
- **Polish** after all stories.
- `scripts/test-journal.ts`, `tests/e2e/journal.spec.cjs`, `data.ts`, `draft.ts`, `workspace.tsx` and `note-list.tsx` are edited by several tasks: run those tasks in ID order, never in parallel.

## Parallel opportunities

- **Phase 2:** none; each task feeds the next.
- **US1:** T015 (`data.ts`), T016 (`actions.ts`) and T017 (`journal-date.tsx`) together after T014.
- **Polish:** T031, T032 and T033 together.

```text
# US1 after T014
T015 src/features/notes/data.ts ║ T016 src/features/notes/actions.ts ║ T017 src/features/notes/journal-date.tsx
```

## Implementation strategy

1. **MVP:** Phases 1–3. Dates and Journal, proven by API and browser tests. Stop and check here.
2. **Add US2:** day filter and compose from Journal.
3. **Add US3:** time zones, live follow and survival; expect little code beyond `live.ts` and `isEcho`.
4. **Polish:** docs, gate, evidence, `versions.md`. One PR to `main` for the increment, linking [issue 43](https://github.com/hsb3/pocketbase-notes-app/issues/43).
