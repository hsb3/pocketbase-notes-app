# R8 contract · Date action, Journal reads and notices

## API

The date route extends the [R5 action contract](../../r5-recover/contracts/actions.md) and shares the [R7 pin](../../r7-pin/contracts/pin.md) handler. Its rules on auth, 401/403/404, private no-store responses, bound values and "no failure writes" apply. A date change is metadata-only (constitution III 2.0.0): it neither takes nor changes a revision.

| Method and path | Request | Success |
|---|---|---|
| `POST /api/notebook/notes/{id}/date` | JSON object with exactly `journal_date`: `""` to remove, or `YYYY-MM-DD` | 200 with `id, user, folder, deleted, revision, journal_date`. `revision` is unchanged. A same-value request writes nothing. |
| `POST …/pin` | Unchanged (R7) | Unchanged |
| `POST …/move`, `…/delete`, `…/restore` | Unchanged | Unchanged projection, without `journal_date` |

Errors:

- **No 409.** A date change is never refused for a stale version, and it never causes a 409 on a later content save.
- **400:** malformed body, unknown or extra key, a non-string, a malformed or impossible day (for example `2026-02-31`), a day outside `0001-01-01`…`9999-12-31`, or the note is deleted. The stored day is unchanged.
- **404:** foreign or missing note, with the same message for both.
- **401:** guest. **403:** a non-`users` auth collection.
- **500:** a corrupt `deleted` value (R5 integrity rule).

Ordinary record routes:

- Create may send `journal_date` (`""` or a valid day); anything else is 400 and nothing is created.
- An update that changes `journal_date` is refused by the collection rule; an update that resends the same value is allowed.
- Owner list and detail reads return `journal_date`. Other accounts see no rows.

## Change notice

The LU [notice](../../../003-live-updates/contracts/notice.md) gains one optional key:

```json
{ "id": "a1b2c3d4e5f6g7h", "folder": "f1f2f3f4f5f6f7f", "deleted": false, "revision": 4, "journal_date": "2026-11-21" }
```

| Write | Keys |
|---|---|
| Create, content save | `id, folder, deleted, revision, pinned, journal_date` |
| Date verb | `id, folder, deleted, revision, journal_date` |
| Pin | `id, folder, deleted, revision, pinned` (unchanged) |
| Move, delete, restore, folder delete | `id, folder, deleted, revision` (unchanged) |

Recipients, timing and "no content" rules are unchanged. A date is a state marker the owner already holds, not writing.

## Client reads

| Function (`src/features/notes/data.ts`) | Change |
|---|---|
| `listNotes(folder, page, day?)` | Adds `journal_date` to `fields`. `folder === "journal"` filters `deleted = "" && journal_date != ""` (or the W1 fallback) sorted `-journal_date,-updated,-id`; with a valid `day`, `deleted = "" && journal_date = {:day}` sorted `-updated,-id`, the day bound through `pb.filter`. |
| `getNote` | Adds `journal_date` to `detailFields` and the validated `Detail` shape (`""` or `validDate()`). |
| `saveNote` | On create only, sends `journal_date` when the draft has one and requires the reply to echo it. Updates never send it. |
| `searchNotes` | Unchanged. |
| `localDate()`, `validDate()` | Restored from `2e99d29^:src/features/entries/data.ts`. |

## Client action

- **Request:** `setJournalDate(id, user, journal_date, session)` in `src/features/notes/actions.ts`, beside `setPin`: same private, uncached request options, accepts the reply only for the same owner and note with `journal_date === requested`.
- **Not used:** R5's `NoteCommand`, `confirms`, revision adoption and "Check again". The draft, its revision and autosave are untouched.
- **On success:** update the held day, refresh the list, announce "Date set." or "Date removed.", return focus to `#note-actions`.
- **On failure** (network error, timeout or 5xx): keep the old day; show "Could not change the date. Try again." with Retry resending the same absolute value. A 404 uses R5's missing-note handling. A 400 for a deleted note re-reads the note.

## UI

- **Note actions:** "Add date…" (undated) or "Change date…" (dated), lucide `CalendarDays`, disabled while its request is in flight. Shown once the note is saved, like Pin and Move.
- **Date dialog** (`src/features/notes/journal-date.tsx`, existing `Dialog`): title "Journal date"; a native date input labelled "Journal date" pre-filled with the current day or today; Today; Remove date (dated notes only); Cancel; Save. Save is disabled for an empty or invalid value. Escape and Cancel change nothing and return focus to `#note-actions`.
- **Open note header:** the formatted day beside the folder name when dated.
- **Folder list:** "Journal" (`CalendarDays`) between Pinned and the real folders.
- **Journal list:**
  - Day headings (formatted day, local noon), rows grouped under them; each row shows its folder name and the pin marker if pinned.
  - Header: a "Filter by day" date input and Clear; the filter lives in `?day=YYYY-MM-DD`.
  - Empty: "No journal notes" / "Add a date from a note's actions menu." Filtered empty: "No notes on {day}" with Clear day.
- **Compose from Journal:** files in Notes with the filtered day or today.
- **Layout:** 390, 810 and 1440 px, keyboard, both themes, no horizontal scrolling.
