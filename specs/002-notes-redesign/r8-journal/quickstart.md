# R8 quickstart · How to prove Journal works

All servers and browsers run in the project's capped containers ([testing rules](../../../docs/testing/verification.md)). Use two disposable accounts, A and B, plus a guest client.

## Commands

```sh
bun run lint && bun run knip && bun run build
make test-api-contained                              # API suite, includes scripts/test-journal.ts and the staged upgrade
make test-browser-contained                          # Chromium + WebKit, every spec
make test-browser-contained CONTAINED_PROFILE=journal # tests/e2e/journal.spec.cjs, report and screenshots
python3 scripts/ai-context.py check && bun run docs:build   # after doc changes
```

The full gate (`.specify/extensions/functionform-gate/scripts/gate.sh full`) runs lint, knip, build and both contained suites.

## W1 exit

Schema migration and generated types.

1. `make codegen` adds `journal_date?: string` to `NotesRecord` in `src/services/pocketbase-types.ts`. A second run produces no diff.
2. The R8 stage of `scripts/test-r2-upgrade.sh` runs up, down, then up again. Rows are byte-equal apart from `journal_date = ''`, the field, rules and index match [the data model](data-model.md#migration-and-rollback) after each step, and down restores the R7 update rule exactly. A pre-existing same-name index makes up fail and change nothing.
3. Against the upgraded database: a PATCH that changes `journal_date` is refused; a create with `2026-02-31` is 400; a create with `2026-11-21` stores it.
4. `EXPLAIN QUERY PLAN` of the SQL PocketBase logs for the Journal and one-day SDK list calls uses `idx_notes_user_journal_date_updated_id` with no `TEMP B-TREE`. Folder, All Notes and Pinned plans are unchanged from R7.

## W2 exit

API checks in `scripts/test-journal.ts`, and notice rows in `scripts/test-live-updates.ts`.

| Scenario | Expected |
|---|---|
| A sets, changes, then removes a day | 200 each; `revision`, `updated`, body, folder, pin unchanged |
| A sets the day the note already has | 200; row unchanged |
| A sends `2026-02-31`, `2026-1-5`, `10000-01-01`, a number, an extra key such as `revision`, or no key | 400; row unchanged |
| A dates on client 1, then saves body on client 2 with the revision read before | Date 200; save 200 (no 409); stored day kept |
| Clients 1 and 2 set different days in sequence | The last request received wins |
| A PATCHes `journal_date` | Refused; stored value unchanged |
| A creates with a valid day, with `""`, with an invalid day | 200 stores it; 200 stores `""`; 400 creates nothing |
| A dates a deleted note | 400 |
| B or the guest dates A's note | 404 and 401; row unchanged |
| A runs date → pin → move → delete → restore | `journal_date` unchanged throughout |
| A deletes a folder holding a dated note, then restores the note | Returns dated, in Notes |
| List reads | Journal lists each active dated note once, `-journal_date,-updated,-id`, across folders; the day filter lists only that day; undated and deleted notes absent; folder, All Notes, Pinned and search order unchanged; B sees none of A's days |
| Notices | One per date change with exactly `id, folder, deleted, revision, journal_date`, including a same-value change; create and save notices carry `journal_date`; B and guest receive none |

## W3 exit

Browser checks in `tests/e2e/journal.spec.cjs` at 390, 810 and 1440 px, Chromium and WebKit.

1. In Garden, open a note, choose "Add date…", fill yesterday, Save. "Date set." is announced, focus returns to `#note-actions`, the URL and draft are unchanged, the header shows the day. Typing straight after reaches Saved.
2. Date a Notes note with the same day. Journal shows both under one heading, each with its folder name; both are still in their folders.
3. Notes on three days: newest day first, newest edit first within a day. Filter to the middle day: only its notes; reload and Back keep `?day=`. Clear: all three days. An empty day shows "No notes on …" with Clear day. A bad `?day=2026-02-31` shows unfiltered Journal.
4. "Change date…" → Remove date: the note leaves Journal and stays in its folder. With no dated notes, Journal shows its empty state.
5. Open Journal, filter, clear and leave without typing: the owner's note count is unchanged. Compose from a filtered Journal and type: the note is in Notes with the filtered day. Compose with no filter: today's local day.
6. Time zones: context K (`Pacific/Kiritimati`) and context P (`Pacific/Pago_Pago`) with the clock fixed at `2026-11-21T11:30:00Z`. Compose from Journal in K stores `2026-11-22`, in P `2026-11-21`. A note dated 2026-11-21 in K shows 21 November in P, in the header and under the Journal heading, and `?day=2026-11-21` finds it in both.
7. Two contexts with the note open: context 1 changes the day; context 2's header and Journal list show it within 2 s, and context 2 keeps typing to Saved with no conflict dialog.
8. With realtime blocked, abort the date reply after the server commits: "Could not change the date. Try again."; Retry leaves the chosen day, no conflict. With realtime on, the note's own notice settles the same lost reply without Retry.
9. Keyboard only: actions → "Change date…" → type a day → Save; Escape cancels and returns focus. Zero horizontal page scroll. Capture Journal with days, the filtered empty day, the Journal empty state and the date dialog in both themes.

## W4 exit

Survival in the UI: date, move, delete, restore through the owner API with the Journal list open; the note is absent while deleted and present once, with its day, after restore.

## W5 exit

`docs/features/notes.md` describes the date action; `docs/features/folders.md` the Journal smart folder, day filter and compose rule; `docs/testing/verification.md` the `journal` profile. `CHANGELOG.md` has an entry. In `versions.md` the R8 row reads `done`.
