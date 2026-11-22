# R8 data model · Journal smart folder

## Note: one new field

| Field | Type | Default | Who writes it |
|---|---|---|---|
| `journal_date` | text, not required, `max: 10`, `pattern: ^\d{4}-\d{2}-\d{2}$` | `""` (no date) | Ordinary create (compose from Journal), validated by `date()` in `onRecordValidate`. Afterwards only `POST /api/notebook/notes/{id}/date`. Ordinary update cannot change it (rule `@request.body.journal_date:changed = false`). |

**Valid values**: `""`, or a real calendar day `YYYY-MM-DD` from `0001-01-01` to `9999-12-31` (`date(value)` in `pb/hooks/entry-validation.js`; `validDate()` on the client). A day has no time and no time zone and is never converted.

Every other field and rule from [R7](../r7-pin/data-model.md) stays as it is. The list and view rules are owner-only already, so `journal_date` is never readable by another account or a guest.

## Write set

| Successful write | Preconditions (inside the transaction) | Exact changes |
|---|---|---|
| Create | R2/R3 create rules; `journal_date` absent, `""` or a valid day | Stores the day as sent (absent → `""`). |
| Set, change or remove date | Owner; note active; body is exactly `journal_date` holding `""` or a valid day. No revision is sent or checked (constitution III, metadata-only). | Sets `journal_date`. `revision` and `updated` never change. Same value → nothing written. Last change wins between devices. |
| Pin | Unchanged from R7 | Unchanged. `journal_date` preserved. |
| Move, delete, folder delete, restore | Unchanged from R5 | Unchanged. `journal_date` preserved byte for byte. |
| Content save | Unchanged from R3 | Unchanged. `journal_date` cannot change. |
| Purge | Unchanged from R5 | The row is removed with its day. |

A date change leaves `revision`, `created`, `updated`, `body`, `title`, `text`, `search_key`, `tasks`, `open_tasks`, `folder`, `deleted`, `pinned` and `attachments` unchanged.

## Index

`idx_notes_user_journal_date_updated_id ON notes (user, journal_date, updated, id)`. Not partial, for the same reason as R7's pin index: the owner list rule compiles to `deleted = '' OR deleted IS NULL`. It replaces the inferred `(user, journal_date)` in versions.md so Journal reads in sort order ([research §5](research.md#5-index-and-the-real-list-sql)). Existing indexes are kept.

## Views (stored nowhere)

| View | Filter | Sort |
|---|---|---|
| Journal | owner, `deleted = ""`, `journal_date != ""` (fallback `journal_date > ""`, chosen in W1 from the plan) | `-journal_date,-updated,-id` |
| Journal, one day | owner, `deleted = ""`, `journal_date = {:day}` | `-updated,-id` |
| Folder, All Notes, Pinned | unchanged (R7) | unchanged |
| Search | unchanged (R4) | unchanged |
| Recently Deleted | unchanged (R5) | unchanged |

## Change notice (LU, never stored)

Gains one optional key, `journal_date` (`""` or a day), present when the write path knows it: create, content save and the date verb. Absent from move, delete, restore, folder delete and pin notices. Full shape: [contract](contracts/journal.md#change-notice).

## Open-note state (client)

The open note's day is held beside the draft, like R7's pin state, and never in the draft's save baseline: `{ id, journal_date, busy?, retry? }`. A new draft composed from Journal also holds `journalDate` for its create body only. `isEcho` ignores a notice only when its `journal_date` is absent or equal to the held day.

## Migration and rollback

`pb/migrations/1795000600_note_journal_dates.js`, following `1795000500_note_pins.js`:

- **Up:** assert the notes `createRule` and `updateRule` equal the R7 strings, that there is no `journal_date` field and no `idx_notes_user_journal_date_updated_id`; then add the field, the index and the update-rule clause. The create rule is not changed.
- **Down:** assert the R8 state, then remove all three, restoring the R7 update rule exactly.
- **Already applied:** up on the R8 state and down on the R7 state return without change (the R7 pattern).
- **Unexpected state:** either direction throws and leaves nothing changed.
- **Existing rows:** read `""` after up. No backfill (no user data; the old `entries.kind` is not carried forward).
