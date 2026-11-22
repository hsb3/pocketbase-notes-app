# Implementation Plan: R8 · Journal smart folder

**Branch**: `r8-journal` | **Base**: `099dd07` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md) | **Issue**: [#43](https://github.com/hsb3/pocketbase-notes-app/issues/43)

**Input**: Feature specification from `specs/002-notes-redesign/r8-journal/spec.md`

## Summary

Each note gets an optional `journal_date`: a date-only text day (`YYYY-MM-DD`, or `""` for none) that no time zone ever converts. After create it is written by one path, a new `date` verb that shares R7's pin handler on the note-action route. Under constitution III (2.0.0) the date is metadata-only, like pin: it neither checks nor advances the content revision, and its raw-SQL update leaves the last-edited time alone. A date change on one device therefore never makes a save on another device fail. It sends the LU change notice with a new `journal_date` key, so the open note and lists on other devices follow it.

- **Lists:** a new Journal pseudo-folder filters dated active notes, newest day first, grouped under day headings, with a `?day=` filter. Folder, All Notes, Pinned and search are unchanged.
- **Client:** "Add date…" / "Change date…" in the note actions opens a dialog with the platform date input. One request sets an absolute value, with a safe Retry. It does not use R5's command pipeline and does not touch the draft.
- **Compose from Journal** files in Notes and carries the filtered day, or today, in the create body.
- **Other actions:** move, delete, restore, pin and purge need no change. They already leave the column alone.

Decisions and rejected options: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (React 19, TanStack Router), PocketBase 0.40.1 JSVM hooks (Goja)

**Primary Dependencies**: Existing only: `pocketbase` SDK ^0.28 (`pb.realtime` for notices), shadcn `Dialog`, `lucide-react` (`CalendarDays`), the platform `<input type="date">`

**Storage**: SQLite through PocketBase. One new text field, one index and one update-rule clause ([data model](data-model.md))

**Testing**: Bun API scripts (`scripts/test-*.ts`, staged upgrade in `scripts/test-r2-upgrade.sh`) and Playwright (`tests/e2e/*.spec.cjs`, Chromium and WebKit, `timezoneId` and `clock`), all through `make test-*-contained`

**Target Platform**: Responsive web, 390 / 810 / 1440 CSS px

**Project Type**: Web app with an embedded backend, shipped as a single image

**Performance Goals**: SC-002: same device within 1 s, second device within 2 s (LU's SC-001 budget)

**Constraints**: A date change must never bump `updated` or `revision`, touch content columns, or cause a 409 on any device. No time zone conversion anywhere. Opening Journal writes nothing. No new dependencies.

**Scale/Scope**: Personal library (hundreds of notes). About 20 files change, 5 of them docs.

## Constitution Check

| Gate | Result (intake and post-design) |
|---|---|
| I. Backend before frontend | Pass. W1 migration and codegen, then W2 verb, notices and API tests, then W3 UI. |
| II. Locked by default | Pass. `journal_date` is writable after create only through the owner-checked action route; the update rule blocks it on the ordinary API; the hook validates it on create. The value is a client choice (like pin), not a derived value, so the server validates rather than computes it. Denied cases (B, guest, forged PATCH, invalid day) are tested. |
| III. Never lose words (2.0.0) | Pass. A date change is a metadata-only write: no content column changes, no revision change, last change wins on its own field ([research §2](research.md#2-date-change-and-the-content-revision-constitution-iii)). Content saves keep the revision check unchanged. The cross-device test proves a date change causes no 409. |
| IV. Smallest change | Pass. Reuses the pin handler (two-verb loop, no copy), the pseudo-folder routing, the row layout, `Dialog`, and `localDate()`/`validDate()` from history. No new route file, feature folder or dependency; the calendar grid that would need one is listed under "Needs owner". Journal is a view over notes, so it stays in `src/features/notes/` as Pinned did. |
| V. Verified for real | Pass. Contained API suite, staged upgrade with EXPLAIN on real SQL, and a browser suite at three widths, both engines, both themes and two time zones. |

No violations, so the Complexity Tracking section is omitted.

## Project Structure

### Documentation (this feature)

```text
specs/002-notes-redesign/r8-journal/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/journal.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code

| Wave | Files (create or modify) | Result |
|---|---|---|
| W1 · schema | Create `pb/migrations/1795000600_note_journal_dates.js`. Regenerate `src/services/pocketbase-types.ts` (`make codegen`). Modify `scripts/test-r2-upgrade.sh`, `pb/hooks/entry-validation.js` (`date(value)`), `pb/hooks/notes.pb.js` (validate on create). | Field, index, rule, create validation. Up, down, up byte-equal; EXPLAIN recorded. [W1 exit](quickstart.md#w1-exit) |
| W2 · API | Modify `pb/hooks/note-actions.pb.js` (pin route → `pin`/`date` loop), `pb/hooks/note-notice.js`, `pb/hooks/notes.pb.js` (`noticeSaved`). Create `scripts/test-journal.ts`. Modify `scripts/test-notes.ts` (call it), `scripts/test-live-updates.ts`. | `date` verb, notices with `journal_date`, denial, concurrency and survival tests. [W2 exit](quickstart.md#w2-exit) |
| W3 · UI | Create `src/features/notes/journal-date.tsx`, `tests/e2e/journal.spec.cjs`. Modify `src/features/notes/{data.ts,actions.ts,draft.ts,live.ts,note-actions.tsx,note-list.tsx,workspace.tsx}`, `src/features/folders/folder-list.tsx`, `src/routes/_authenticated/_library.folders.$folderId.tsx`, `scripts/run-contained.sh` (profile `journal`), `tests/unit/note-draft.test.cjs`, and any existing spec whose exact list projection changes (`tests/e2e/notes.spec.cjs`). | Date action and dialog, header day, Journal view with headings and day filter, compose from Journal, live follow. [W3 exit](quickstart.md#w3-exit) |
| W4 · survival | Tests only, unless a survival row fails. | Date survives move, delete, folder delete, restore in API and UI. [W4 exit](quickstart.md#w4-exit) |
| W5 · docs and gate | Modify `docs/features/{notes,folders}.md`, `docs/testing/verification.md`, `CHANGELOG.md`, `specs/002-notes-redesign/versions.md`. | Docs match the behaviour; R8 marked `done`. [W5 exit](quickstart.md#w5-exit) |

**Structure Decision**: Use the existing layout. The date is note metadata and Journal is a pseudo-folder like `pinned`, so both belong to `src/features/notes/`. The one new component file (`journal-date.tsx`) replaces the deleted `src/features/entries/date-picker.tsx`.

## Verification Plan *(mandatory)*

| Requirement or scenario | Check that proves it (file or command) | Kind |
|---|---|---|
| FR-001 optional day, default none, owner-only | `scripts/test-journal.ts` (create default `""`, B and guest reads); `make codegen` diff | API |
| FR-002 date action once saved, keyboard; header shows day | `tests/e2e/journal.spec.cjs` W3 1, 9 | browser |
| FR-003 Journal once each, grouped, order, folder name, empty state | `scripts/test-journal.ts` list rows; journal spec W3 2–4 | API, browser |
| FR-004 day filter in the address, Back and reload, empty, clear | journal spec W3 3 | browser |
| FR-005 no time zone shift; today is local | journal spec W3 6 (`timezoneId`, fixed clock); `scripts/test-journal.ts` stores the string verbatim | browser, API |
| FR-006 date change keeps `updated`, writing, folder | `scripts/test-journal.ts` before/after row compare | API |
| FR-007 independent of version; last wins; idempotent | `scripts/test-journal.ts` concurrency rows; journal spec W3 1 (typing after), 7 | API, browser |
| FR-008 survives move, delete, folder delete, restore; deleted absent | `scripts/test-journal.ts` survival; journal spec W4 | API, browser |
| FR-009 compose from Journal: Notes, filtered day or today; opening creates nothing | journal spec W3 5, 6; `scripts/test-journal.ts` create rows | browser, API |
| FR-010 date change reaches other devices | `scripts/test-live-updates.ts` date notice rows; journal spec W3 7 | API, browser |
| FR-011 real days only, previous day kept | `scripts/test-journal.ts` 400 rows; staged upgrade create row | API |
| FR-012 server-enforced owner-only | `scripts/test-journal.ts` (B 404, guest 401, forged PATCH refused, B notices none) | API |
| Story 1.1–1.7 | journal spec W3 1–4, 9; API list rows | browser, API |
| Story 2.1–2.5 | journal spec W3 3, 5 | browser |
| Story 3.1–3.2 | journal spec W3 6 | browser |
| Story 3.3–3.5 | `scripts/test-journal.ts` survival; journal spec W4 | API, browser |
| Story 3.6 | journal spec W3 7 | browser |
| Edge: date is not an edit | FR-006 row | API |
| Edge: concurrent change, uncertain reply | FR-007 row; journal spec W3 8 | API, browser |
| Edge: open note keeps draft | journal spec W3 1 | browser |
| Edge: opening Journal creates nothing | journal spec W3 5 (owner note count before and after) | browser |
| Edge: invalid days, bad `?day=` | FR-011 row; journal spec W3 3 | API, browser |
| Edge: any day | `scripts/test-journal.ts` (`0001-01-01`, `9999-12-31` accepted) | API |
| Edge: another writer | FR-012 row | API |
| Edge: search ignores dates | `scripts/test-journal.ts` (search order and projection unchanged) | API |
| Edge: pin ignored for order, marker kept | `scripts/test-journal.ts` order row; journal spec W3 2 | API, browser |
| SC-001 three actions, 3 widths, no horizontal scroll | journal spec W3 1, 9 | browser |
| SC-002 1 s same device, 2 s second device | journal spec W3 1 (1 s assertion), 7 (2 s assertion) | browser |
| SC-003 once when active, never when deleted or undated | FR-003, FR-008 rows | API, browser |
| SC-004 same day 25 h apart | journal spec W3 6 | browser |
| SC-005 no overwritten edits, no date-caused refusals, no flipped days | FR-007 rows; journal spec W3 7, 8 | API, browser |
| SC-006 Journal creates nothing; B and guest see nothing | journal spec W3 5; FR-012 row | browser, API |
| Index use on real list SQL | `scripts/test-r2-upgrade.sh` R8 stage (EXPLAIN of logged SQL) | API |
| Migration rollback | `scripts/test-r2-upgrade.sh` (up, down, up, unexpected index) | API |

Gaps: no physical-device check. R8 adds no keyboard or viewport behaviour beyond a native date input in an existing dialog; mobile Safari's own date wheel is not exercised by WebKit at 390 px and is listed in the PR as unverified on a real phone.

## Needs owner

- **Calendar grid.** The roadmap's reuse of `src/features/entries/date-picker.tsx` needs `react-day-picker` back (R2 removed it with `calendar.tsx` and `popover.tsx`). That is a new dependency, so it is not decided here. Provisional default: the platform date input in the existing `Dialog`, keeping the old picker's Today and Clear date behaviour ([research §8](research.md#8-date-control-without-a-new-dependency)). Switching later changes only `journal-date.tsx`.

## New Dependencies *(mandatory)*

None. `CalendarDays` comes from the installed `lucide-react`; the date input is a platform control; `Dialog` is an existing shadcn primitive.
