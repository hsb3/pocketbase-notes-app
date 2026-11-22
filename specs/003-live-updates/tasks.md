# Tasks: Live updates on open notes and lists

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md), [data model](data-model.md), [contract](contracts/notice.md), [quickstart](quickstart.md)

**Tests**: Requested. The plan's [verification table](plan.md#verification-plan-mandatory) names a check for every requirement. Each phase writes its checks first and records them failing on the predecessor commit before the implementation task.

**Containment**: Servers and browsers run only through `make test-api-contained`, `make test-browser-contained` or `bash scripts/run-contained.sh <suite>`, never on the host. Stop nothing you did not start. The owner's `pocketbase-notes` stack stays untouched.

**Waves**: Phase 2 is plan wave W1 (server notices). Phases 3 and 4 are W2 (open note). Phase 5 is W3 (lists). Phase 6 is W4 (catch-up and fallback). Phase 7 is W5 (docs and gate). US3 runs before US2, both P2, because it extends the same open-note code as US1. Commit once per wave, as [CONTRIBUTING.md](../../CONTRIBUTING.md) requires.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from [spec.md](spec.md)

---

## Phase 1: Setup

**Purpose**: Confirm the baseline the waves build on.

- [ ] T001 Confirm branch `live-updates` sits on `fe0b749` plus the design commit, and that `bun run lint`, `bun run knip` and `bun run build` exit 0 before any code change. Record the exits as the predecessor baseline in the "LU gate evidence" section at the end of `specs/003-live-updates/tasks.md` (added in T026)

---

## Phase 2: Foundational (W1 server notices)

**Purpose**: Every committed note write sends an owner-only notice. Every story depends on this.

**⚠️ CRITICAL**: No client work starts until T006 passes.

- [ ] T002 Create `scripts/test-live-updates.ts` exporting one async case `liveUpdates(admin, ownerA, otherB, guest)` (shape of `pins` in `scripts/test-pins.ts`). Add a small SSE helper in the same file: `fetch` `GET /api/realtime`, parse `PB_CONNECT` to get `clientId`, `POST /api/realtime` with `{ clientId, subscriptions: [topic] }` and the account token (none for the guest), and collect events for a bounded window (no unbounded loops: each read has a timeout and the stream is cancelled at the end of the case). Subscribe A1 (A), B and the guest to `notebook-changes`, and B also to `notes/*`. Then, through a second A client, create a note, save it, move it, pin, unpin, delete, restore, and delete a folder holding two notes. Assert: A1 receives exactly one `notebook-changes` event per write (two for the folder delete); each payload has exactly the keys `id`, `folder`, `deleted`, `revision` and, for create, save and pin, `pinned`, holding the post-write values ([contract](contracts/notice.md#event)); a GET right after each notice returns that revision; no payload has `user`, `title`, `text`, `body`, `excerpt`, `search_key`, `tasks` or `attachments`; B, the guest and a superuser client (from `admin`) receive zero `notebook-changes` events, and B's `notes/*` receives zero events for A's notes
- [ ] T003 In `scripts/test-live-updates.ts` add the refusal and isolation rows: a stale-revision move (409), a pin with an extra key (400), B's move of A's note (404), a stale content PATCH (409) and a restore past retention (410, deletion time set by superuser) each send zero notices to anyone; B saving its own note notifies B's subscriber and not A1; re-posting A1's `clientId` subscription with B's token returns 403
- [ ] T004 Modify `scripts/test-notes.ts` to import `liveUpdates` and call it in the case loop beside `"note pins"`. Run `make test-api-contained` on the predecessor commit and record the live cases failing (A1 receives zero notices)
- [ ] T005 Create `pb/hooks/note-notice.js` exporting `send(app, note)`, where `note` is `{ id, user, folder, deleted, revision, pinned? }`. Build one `new SubscriptionMessage({ name: "notebook-changes", data: JSON.stringify({ id, folder, deleted: !!deleted, revision, ...(pinned is boolean ? { pinned } : {}) }) })`. Loop over `app.subscriptionsBroker().clients()`; send only when `client.hasSubscription("notebook-changes")` and `client.get("auth")` is a record of the `users` collection whose ID equals `note.user`. Catch and log send errors (`app.logger().warn`) so a notice can never fail a committed write ([research §1–2](research.md#1-how-a-raw-sql-write-produces-a-realtime-event))
- [ ] T006 Wire the helper, loading it with `require(`${__hooks}/note-notice.js`)` inside each handler. (a) `pb/hooks/notes.pb.js`: add `onRecordAfterCreateSuccess` and `onRecordAfterUpdateSuccess` for `notes` that call `e.next()` and then send the record's `id`, `user`, `folder`, `deleted`, `revision` and `getBool("pinned")`. (b) `pb/hooks/note-actions.pb.js`: after `runInTransaction` returns, before `e.json(200, result)`, send `result` in both the move/delete/restore loop and the pin route. (c) `pb/hooks/folders.pb.js`: in `folderAction`, collect the soft-deleted rows inside the transaction and, after it returns on the delete path only, send one notice per row with `folder: ""`, the deletion time and `revision + 1`. Do not change any SQL, revision check or reply shape. Pass `make test-api-contained` ([W1 exit](quickstart.md#w1-exit))

**Checkpoint**: The server sends owner-only notices for every committed note write. Commit W1 (T002–T006).

---

## Phase 3: User Story 1 · An open note picks up writing saved on another device (P1) 🎯 MVP

**Goal**: A clean open note takes the newer version. A dirty one gets R3's conflict at once. Own saves are never remote.

**Independent test**: Two contexts of A on one note. A2 saves; A1 shows the words, then saves with no conflict.

### Tests for User Story 1

- [ ] T007 [US1] Create `tests/e2e/live-updates.spec.cjs` using `tests/e2e/fixtures.cjs` and `tests/e2e/note-helpers.cjs`, with two browser contexts of one account (pattern: `browser.newContext` in `tests/e2e/pin.spec.cjs`), at 390, 810 and 1440 px in Chromium and WebKit. Cover [W2 exit](quickstart.md#w2-exit) steps 1, 2 and 7. Step 1: A1's words appear within 2 s, **Saved** shows, the status region reads "Updated from another device.", A1 keeps editor focus if it had it, and A1 then reaches **Saved** with no conflict dialog. Step 2: hold A1's PATCH with `page.route`; while it is held, a second A2 save leaves the open dialog and words unchanged, and **Reload saved** then loads the newest version. Step 7: count `GET /api/collections/notes/records/<id>` in A1 while it types and saves; expect zero beyond the initial open
- [ ] T008 [US1] Add profile `live` to `scripts/run-contained.sh`, mirroring `pin`: add `browser/live` to the allowed list and the `default|plain|…|pin|live` report branch, run `tests/e2e/live-updates.spec.cjs --workers=1 --retries=0`, and extend the report check's expected file set to `{"live-updates.spec.cjs"}` for `live`. Take no screenshots: the feature adds no UI. Run `make test-browser-contained CONTAINED_PROFILE=live` on the W1 commit and record the failures (A1 never shows A2's words)

### Implementation for User Story 1

- [ ] T009 [P] [US1] Create `src/features/notes/live.ts` exporting `watchNotebook(onNotice, onReconnect)`. It calls `pb.realtime.subscribe("notebook-changes", …)` and `pb.realtime.subscribe("PB_CONNECT", …)` and returns a function that unsubscribes both. It ignores the first `PB_CONNECT` and calls `onReconnect` on every later one. It validates each payload before calling `onNotice`: `id` matches `/^[a-z0-9]{15}$/`, `folder` is a string, `deleted` is a boolean, `revision` is a safe integer ≥ 1, and `pinned` is absent or a boolean. Malformed payloads are dropped. It exposes whether the first subscribe failed, so W4 can retry ([research §3](research.md#3-sdk-subscribe-reconnect-and-pb_connect-pocketbase-028-installed-0282))
- [ ] T010 [P] [US1] Modify `src/features/notes/draft.ts`. Add `remote(note)` implementing the [decision table](research.md#4-a-remote-change-versus-the-pending-and-in-flight-autosave). It returns `"same"` (pin only), `"adopted"` (body and attachments equal the baseline: adopt `folder`, `revision` and `updated`, keep unsaved edits, `resume()`), `"replaced"` (clean: reuse `replaceSaved`) or `"conflict"` (dirty: reuse `changedElsewhere`). Add `isEcho(notice, pinned)` for the echo rule in [the data model](data-model.md#open-note-state-on-a-notice-client). Reuse `equalJSON` from `data.ts` (export it) rather than a new comparison
- [ ] T011 [US1] Modify `src/features/notes/workspace.tsx` (`Library`). Start `watchNotebook` in an effect keyed on `user` and `session`, with cleanup on unmount, and drop notices unless `session.current()`. For a notice on the open note that is not an echo: if the note is busy (`draft.busy`, `pin.busy`, `command.current`, `pending.current`, or `draft.failure === "conflict"`), keep it in a ref. Otherwise `draft.pause()`, `getNote`, then `remote()`, then `resume()`. Update the pin state from the read. On `"replaced"`, `announce("Updated from another device.")` and refocus `[role="textbox"]` when focus was inside the editor before the read. A `NoteAccessError` or 404 goes to the existing `missing(note)`. Re-check the kept notice from `onSaved`, `endAction`, `cancel`/`finish`, the end of `togglePin` and the conflict dialog closing (depends on T009, T010). Pass `make test-browser-contained CONTAINED_PROFILE=live` for the T007 rows

**Checkpoint**: Story 1 works; MVP.

---

## Phase 4: User Story 3 · An open note follows move, delete, restore and pin from another device (P2)

**Goal**: Metadata changes elsewhere are adopted without a conflict. A delete elsewhere shows the unavailable paths.

**Independent test**: A2 moves, pins and deletes the note open in A1. A1 follows each change and keeps saving.

- [ ] T012 [US3] In `tests/e2e/live-updates.spec.cjs` add [W2 exit](quickstart.md#w2-exit) steps 3–6. A clean move is adopted. A held-PATCH move ends at **Saved** with the server holding A1's words in the new folder and no dialog. Pin and unpin flip A1's menu label. A delete shows **Note unavailable** when clean and recovery with **Copy draft** when dirty. Then A2 restores: A1 stays unavailable and its list shows the note. While a move is pending in A1 (held action reply), an A2 save is applied only after the move settles. Run the `live` profile on the Phase 3 commit and record the held-PATCH move failing with a conflict dialog
- [ ] T013 [US3] Modify `reconcile()` in `src/features/notes/draft.ts`. When no submission matches and `this.rejection` is `"stale"` or unset, and the read note's `body` and `attachments` equal the baseline's but its `folder` or `revision` differ, adopt `folder`, `revision` and `updated` into the baseline and return `"replay"`. Every other branch is unchanged ([research §4](research.md#4-a-remote-change-versus-the-pending-and-in-flight-autosave)). Run `make test-browser-contained CONTAINED_PROFILE=resilience` to confirm SC-003 still passes, then the `live` profile for T012

**Checkpoint**: Stories 1 and 3 work. Commit W2 (T007–T013).

---

## Phase 5: User Story 2 · Lists stay current with changes from other devices (P2)

**Goal**: The visible list and Recently Deleted follow other devices without flicker, focus loss or a burst of reads.

**Independent test**: A2 creates, pins, moves, deletes and restores notes while A1 shows the folder; A1's rows match the server after each.

- [ ] T014 [US2] In `tests/e2e/live-updates.spec.cjs` add [W3 exit](quickstart.md#w3-exit) steps 1–4: folder, **All Notes**, **Pinned** and search-result rows match a fresh read within 2 s; Recently Deleted follows deletes, restores and a folder delete without its heading taking focus; no empty-state flash; `scrollTop` and `document.activeElement` are unchanged; text being typed in Search keeps its value and caret; a 30-note folder delete causes at most 3 list reads in A1. Record the failures on the W2 commit
- [ ] T015 [P] [US2] Modify `src/features/notes/note-list.tsx`: add a `live: number` prop. A change to it re-reads the current view (list or search) without clearing the shown rows. A failed live read keeps the rows and shows nothing new. Initial loads, `refresh` and Retry keep their current behaviour
- [ ] T016 [P] [US2] Modify `src/features/notes/recently-deleted.tsx`: add a `live: number` prop whose change runs the existing quiet `load()` (the `visibilitychange` path), never `enter()`
- [ ] T017 [US2] Modify `src/features/notes/workspace.tsx`: the first accepted notice opens a 250 ms merge window and the `live` counter is bumped once when it closes, never a trailing debounce ([research §7](research.md#7-lists-coalescing-and-stable-rows)); clear the timer on unmount. Pass it to `NoteList` and `RecentlyDeleted` (depends on T015, T016). Pass the `live` profile for T014

**Checkpoint**: Stories 1–3 work. Commit W3 (T014–T017).

---

## Phase 6: User Story 4 · Catch up after sleep, network loss or a long session (P3)

**Goal**: Focus and reconnect re-read everything. A failed first connect is retried. Realtime down changes nothing else. Sign-out stops updates.

**Independent test**: Block A1's realtime, change things in A2, make A1 visible again: A1 matches the server.

- [ ] T018 [US4] In `tests/e2e/live-updates.spec.cjs` add [W4 exit](quickstart.md#w4-exit) steps 1–5. Make visible by overriding `document.visibilityState` and dispatching `visibilitychange`. Use `context.setOffline(true/false)` for the reconnect. With `/api/realtime` aborted for the whole test, the R3 two-context conflict and its choices work. After the session expires (reuse the R3 expiry setup from `tests/e2e/save-resilience.spec.cjs`), A2's saves cause no read in A1. After sign-out and sign-in as C in the same tab, A's saves cause no read and no notice in C's tab. SC-001 runs 20 edit-to-visible trials per engine at 1440 px, requires at least 19 within 2 s, and attaches the timings to the report. Record the failures on the W3 commit
- [ ] T019 [US4] Modify `src/features/notes/workspace.tsx`: one `catchUp()` bumps `live`, re-reads folders (add a counter to the `listFolders` effect's dependencies) and checks the open note as if an unknown-revision notice arrived. Call it on `visibilitychange` to visible, from `watchNotebook`'s `onReconnect`, and on `online`. On `visibilitychange` and `online`, if the first subscribe failed, start `watchNotebook` again (depends on T009, T017)
- [ ] T020 [US4] Run `make test-browser-contained` (full default suite). For each existing test that now fails because a second context no longer stays stale (expected in `tests/e2e/save-resilience.spec.cjs`), abort `**/api/realtime` in that context with `page.route` so it keeps testing the fallback path. Do not weaken any assertion. List each changed test in the gate evidence. Pass the full suite and the `live` profile

**Checkpoint**: All four stories pass. Commit W4 (T018–T020).

---

## Phase 7: Polish (W5 docs and gate)

- [ ] T021 [P] Modify `docs/features/notes.md`: add a "Live updates" section. Cover when an open note takes another device's version, when the conflict dialog shows, the "Updated from another device." status, adopting a move with unsaved edits, catch-up on focus and reconnect, and that saving never depends on the live connection. Under the API part, document the `notebook-changes` topic and payload ([contract](contracts/notice.md)). Update the pin section's "sees the new pin state on its next read" wording if it is present
- [ ] T022 [P] Modify `docs/features/folders.md`: lists and Recently Deleted follow other devices; the folder column itself refreshes on focus and reconnect only
- [ ] T023 [P] Modify `docs/testing/verification.md`: add the `live` row to the additional-profiles table and a short "Live updates" section naming `scripts/test-live-updates.ts` and `tests/e2e/live-updates.spec.cjs`
- [ ] T024 [P] Add an Unreleased entry for live updates to `CHANGELOG.md`, linking issue 68
- [ ] T025 Run `python3 scripts/ai-context.py check` and `bun run docs:build`; fix any failure ([W5 exit](quickstart.md#w5-exit))
- [ ] T026 Run the full gate `.specify/extensions/functionform-gate/scripts/gate.sh full` and `make test-browser-contained CONTAINED_PROFILE=live`. Append an "LU gate evidence" section to `specs/003-live-updates/tasks.md` (shape of the R7 ledger): tested commits, red and green commands with exits, SC-001 timings per engine, tests changed in T020, deviations from task text, and `docker ps -a` showing no leftover containers. Mark only demonstrated tasks
- [ ] T027 Modify `specs/002-notes-redesign/versions.md` last: set the LU row to `done` once T026 is green

---

## Dependencies

- **Phase 1 → Phase 2 → stories.** T002–T004 (red) before T005–T006. T006 blocks every story.
- **US1 (P1)** depends only on Phase 2. T009 and T010 before T011.
- **US3 (P2)** depends on US1's subscription and `remote()` (T011).
- **US2 (P2)** depends on US1's subscription (T011); T015 and T016 before T017.
- **US4 (P3)** depends on US1 (T009) and US2's `live` counter (T017).
- **Polish** after all stories; T027 last.
- `tests/e2e/live-updates.spec.cjs`, `src/features/notes/workspace.tsx` and `src/features/notes/draft.ts` are edited by several tasks: run those tasks in ID order, never in parallel.

## Parallel opportunities

- **Phase 2:** none; each task feeds the next.
- **US1:** T009 (`live.ts`) and T010 (`draft.ts`) together after T008.
- **US2:** T015 (`note-list.tsx`) and T016 (`recently-deleted.tsx`) together.
- **Polish:** T021–T024 together.

```text
# US1 after T008
T009 src/features/notes/live.ts   ║ T010 src/features/notes/draft.ts
# US2 after T014
T015 src/features/notes/note-list.tsx ║ T016 src/features/notes/recently-deleted.tsx
```

## Implementation strategy

1. **MVP:** Phases 1–3. Server notices plus a live open note, proven by the API suite and the `live` profile. Stop and check here.
2. **Add US3:** metadata adoption and the `reconcile()` replay, re-proving SC-003 with the `resilience` profile.
3. **Add US2:** live lists.
4. **Add US4:** catch-up, fallback, existing-suite adjustments.
5. **Polish:** docs, gate, evidence, `versions.md`. One pull request to `main` for the increment, linking [issue 68](https://github.com/hsb3/pocketbase-notes-app/issues/68).
