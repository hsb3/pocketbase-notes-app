# R8 research · Journal smart folder

Each decision below was settled by reading current `main` (`099dd07`), the pre-R2 tree (`2e99d29^`), the installed `pocketbase` SDK 0.28 and the pinned PocketBase 0.40.1 behaviour already recorded by R4, R7 and LU. Claims marked *source reading* were not run; the W1 and W2 tests prove them.

## 1. Field shape: a date-only text field

- **Decision.** Add `journal_date`, a PocketBase **text** field, not required, `max: 10`, `pattern: ^\d{4}-\d{2}-\d{2}$`. The empty string means "no date". Calendar validity (no 31 February, range 0001-01-01 to 9999-12-31) is checked by `date(value)` in `pb/hooks/entry-validation.js`, called from `onRecordValidate` (create) and from the date verb (§3).
- **Rationale.**
  - A PocketBase `date` field stores a UTC instant (`YYYY-MM-DD HH:MM:SS.sssZ`). A day picked at local midnight east of UTC would be stored as the previous UTC day, which is the time-zone shift FR-005 forbids. A text day is never converted by the server, the SDK or the browser.
  - The string sorts lexically in calendar order, so `-journal_date` is newest-first with no parsing.
  - The field pattern skips empty values (PocketBase's text validator returns early on `""`, *source reading*), so undated notes stay valid. The pattern is a schema-level backstop for superuser writes; the hook is the real check.
- **Validator change.** `date(kind, value)` has no caller today (`grep "date(" pb/hooks` finds only its definition): R1 kept it from `entries`. It becomes `date(value)`: `""` passes; otherwise the existing regex, lower bound and round-trip check apply. Its `kind` branch goes, as versions.md R1 already said it would.
- **Client.** `localDate()` and `validDate()` come back verbatim from `2e99d29^:src/features/entries/data.ts` into `src/features/notes/data.ts`. `localDate()` reads the local `getFullYear/getMonth/getDate`, so "today" is the device's local day (FR-005, Story 3.2). `validDate()` mirrors the server check.
- **Display.** A day is shown with `new Date(`${day}T12:00:00`)` (local noon, the old picker's pattern) and `toLocaleDateString`. Parsing the bare `YYYY-MM-DD` would be read as UTC midnight and show the previous day west of UTC.
- **Alternatives rejected.** *PocketBase `date` field* (UTC instant, above). *Integer day number* (unreadable in the admin UI and in logs, no gain).

## 2. Date change and the content revision (constitution III)

- **Decision.** A date change is a **metadata-only write**. It neither checks nor advances `revision`, leaves `updated` alone, changes no content column, and resolves last change wins. Same-value requests succeed and write nothing.
- **Rationale.**
  - Constitution III (2.0.0): "A metadata-only write (an absolute value such as pin) cannot overwrite words, so it does not use that check." A journal day is an absolute value: setting it to D on one device and to E on another loses no writing either way.
  - R7 already proved the pattern (`pb/hooks/note-actions.pb.js` pin route; `scripts/test-pins.ts` shows a pin followed by a stale-revision body save, both 200).
  - Advancing the revision would make every other device with unsaved edits take R3's conflict path for a change that cannot touch words. That is the false-conflict class the [sync evaluation](../../../docs/architecture/evaluations/sync-and-presence/report.md) records.
  - Not bumping `updated` keeps folder lists and All Notes stable when a writer back-dates a batch of notes (FR-006, spec clarification 1).
- **Parent spec.** Parent FR-003 asks for revision-conflict protection on "every note change". Constitution III 2.0.0 (amended 2026-11-21) carves out metadata-only absolute values, and R7 pin already ships under it. The parent edge "a metadata change from a stale version may not silently replace newer edits" holds: a date change replaces no edit.
- **Rejected.** *Send the date with the next content PATCH.* It serializes a metadata choice behind the autosave queue, bumps `revision` and `updated`, and makes a date change impossible while a save is failing.

## 3. Where the date is written

- **Decision.**
  - **Existing notes:** a new verb `POST /api/notebook/notes/{id}/date` with body exactly `{ "journal_date": "" | "YYYY-MM-DD" }`. It shares one handler with `pin`: the R7 pin route becomes a two-verb metadata loop (`pin`, `date`) that reads its verb from the URL path, because Goja compiles each callback in isolation and cannot capture a loop variable (the move/delete/restore loop does the same). The verb picks the key, the value check (`typeof boolean` or `date()`) and the fixed column name. One bound `UPDATE notes SET <column>={:value} WHERE id={:id} AND user={:user} AND deleted='' AND <column><>{:value}`.
  - **New notes:** the ordinary create may carry `journal_date` (compose from Journal, §7). `onRecordValidate` validates it.
  - **Ordinary update:** the notes `updateRule` gains `@request.body.journal_date:changed = false`, so a PATCH can never change the day. The create rule is unchanged.
- **Rationale.** Raw SQL leaves the `updated` autodate alone (R7 research §1). Sharing the pin handler reuses its owner, raw-date, transaction, body-shape and no-store guards instead of copying 30 lines. `ownedNote()` in `pb/hooks/note-lifecycle.js` stays unchanged because the staged upgrade runs current hooks against older schemas without the column (R7 T009 deviation).
- **Rejected.** *Block `journal_date` on create too, then date via the verb after the first save.* It leaves a window where a note composed in Journal is not in Journal, and needs a second request with its own failure path.

## 4. Live updates

- **Decision.**
  - `pb/hooks/note-notice.js` adds `journal_date` to the notice when the write path knows it (`typeof note.journal_date === "string"`), exactly as it does for `pinned`.
  - `noticeSaved` in `pb/hooks/notes.pb.js` passes `journal_date` from the record (creates and content saves). The date verb passes it from its result. Move, delete, restore, folder delete and pin do not know it and omit it.
  - Client: `parse()` in `src/features/notes/live.ts` accepts an optional `journal_date` that is `""` or a `validDate()` day. `NoteDraft.isEcho(notice, pinned, journalDate)` also treats a notice as an echo only when `journal_date` is absent or equal to the open note's day. `followRemote` in `workspace.tsx` defers while a date request is in flight (as it does for `pin.busy`) and sets the day from the fresh read, like the pin.
- **Rationale.** A date change keeps `revision`, `folder` and `pinned` equal, so without the new key the open note on another device would drop the notice as its own echo (`isEcho` today). Lists need no change: every notice already triggers the 250 ms list re-read, which covers Journal.
- **Consequence.** `scripts/test-live-updates.ts` compares notices with `assert.deepEqual`, so its create and save expectations gain `journal_date: ""`. The contract change is additive; old clients ignore the key.

## 5. Index and the real list SQL

- **Decision.** `idx_notes_user_journal_date_updated_id ON notes (user, journal_date, updated, id)`, not partial. It replaces versions.md's inferred `(user, journal_date)`: the two extra columns let SQLite read Journal in sort order.
- **Queries.**
  - Journal: filter `deleted = "" && journal_date != ""`, sort `-journal_date,-updated,-id`.
  - Day: filter `deleted = "" && journal_date = {:day}`, sort `-updated,-id`.
- **Evidence required (W1).** Like R7, the staged upgrade captures the SQL PocketBase actually runs (dev query log) for both SDK list shapes and records `EXPLAIN QUERY PLAN`. Pass: the new index is used, with `journal_date=?` in the day plan, and no `TEMP B-TREE` in either.
- **Known risk.** R7 found that the list rule compiles `deleted = ""` to `deleted = '' OR deleted IS NULL`, which made a partial index unusable. PocketBase compiles `!=` against an empty literal into a NULL-safe expression as well (*source reading*). That cannot seek on `journal_date`, but with `user=?` bound the backward index scan still yields `journal_date, updated, id` order and skips undated rows as a filter. If the plan shows a temporary sort anyway, the fallback filter is `journal_date > ""`, a plain range that also excludes undated notes. W1 decides between them with the plan in hand and records which one shipped.
- **Unchanged.** Folder, All Notes and Pinned keep R7's index and plans. W1 re-records them to show no regression.

## 6. Journal view, URL and ordering

- **Decision.**
  - Pseudo-folder ID `journal`, beside `all`, `pinned` and `recently-deleted` (real IDs are 15 characters, so no collision). Route `/folders/journal`, day filter `?day=YYYY-MM-DD`. `validateSearch` in `src/routes/_authenticated/_library.folders.$folderId.tsx` keeps `day` only when `validDate()` accepts it; a bad value is dropped and the unfiltered Journal shows (spec edge "Invalid days"). `ListPosition` gains `day` so Back from a note restores the filter.
  - Rows are grouped under a day heading (a non-interactive element with the formatted day), days newest first, notes most recently edited first within a day; pin does not affect order but the pin marker still shows. Each row shows its folder name on the line Pinned already uses. A day continuing onto the next 20-row page repeats its heading there.
  - The day filter is a native date input ("Filter by day") with a Clear button in the Journal list header.
  - Empty states: "No journal notes" with "Add a date from a note's actions menu."; filtered: "No notes on {day}" with Clear day.
  - Folder list: Journal (lucide `CalendarDays`) between Pinned and the real folders.
- **Search.** Unchanged and global (spec clarification 4). While `q` is set, the list shows search results; clearing returns to Journal with `day` kept.

## 7. Compose from Journal

- **Decision.** Compose from `journal` files in the default folder, like `all` and `pinned`. The new draft carries `journalDate = day || localDate()`. `NoteDraft` sends it in the create body only (revision 0) and keeps it through `suspend()` and re-sign-in. `saveNote` checks the create reply echoes it. Nothing is created until the first autosave of real content, so opening Journal and composing without typing creates nothing (FR-009, SC-006).
- **Lost create reply.** The R3 path retries as create, gets "id exists", and continues as update: the committed create already holds the day. A retried create carries the same day. No new path.

## 8. Date control without a new dependency

- **Facts.** The old `src/features/entries/date-picker.tsx` (`2e99d29^`) wraps shadcn `Calendar` and `Popover`. R2 deleted both components and removed `react-day-picker` from `package.json`. `radix-ui` (which has Popover) is still installed; `react-day-picker` is not.
- **Decision (provisional, needs owner).** A new `src/features/notes/journal-date.tsx` keeps the old picker's behaviour and labels: an "Add date…" / "Change date…" item in the note actions opens the existing `Dialog` with a native `<input type="date">` labelled "Journal date" (`min="0001-01-01"`, `max="9999-12-31"`), plus Today, Remove date (when dated), Cancel and Save. The native input returns `YYYY-MM-DD` with no time zone, works by keyboard and is supported by Chromium, WebKit and mobile Safari. Playwright `fill()` drives it in both engines.
- **Owner's alternative.** Re-add `react-day-picker` and restore `calendar.tsx` and `popover.tsx` from `2e99d29^` for the old calendar grid. That is a new dependency under constitution IV and `AGENTS.md`, so it is not decided here.

## 9. Move, delete, restore, folder delete, purge and search

- **Decision.** No code change. None of their `UPDATE` statements (`pb/hooks/note-actions.pb.js`, `pb/hooks/folders.pb.js`) touches `journal_date`, and Journal filters `deleted = ""`. W2 asserts the day survives each one byte for byte (FR-008). Purge removes the row with its day. Search keeps its filter and projection; it does not return `journal_date`.

## 10. Time-zone testing

- **Decision.** The browser suite opens two contexts with Playwright `timezoneId`: `Pacific/Kiritimati` (UTC+14) and `Pacific/Pago_Pago` (UTC−11), 25 hours apart. A note dated in one shows the same day, in the note and in Journal, in the other, and the `?day=` filter finds it in both (SC-004). For "today" (Story 3.2) the context fixes the clock with `page.clock.setFixedTime("2026-11-21T11:30:00Z")`, which is 22 November in Kiritimati and 21 November in Pago Pago; compose from Journal must store each context's local day. `setFixedTime` keeps timers running, so autosave still works.
