# Live updates data model

## Stored data: no change

No collection, field, index or rule changes, so there is no migration and no `make codegen`. Every field and rule from [R7](../002-notes-redesign/r7-pin/data-model.md) stays as it is.

## Change notice (never stored)

One realtime message on the topic `notebook-changes`. Full wire format: [contracts/notice.md](contracts/notice.md).

| Field | Type | Meaning |
|---|---|---|
| `id` | string, 15 `[a-z0-9]` | The note that changed |
| `folder` | string | Folder after the write; `""` after a folder delete |
| `deleted` | boolean | `true` when the note is soft-deleted after the write |
| `revision` | integer ≥ 1 | Revision after the write (unchanged by pin) |
| `pinned` | boolean, optional | Pin after the write. Absent from move, delete and restore notices, which keep R7's reply shape |
| `journal_date` | string, optional | Journal day after the write (`""` for none). Added by R8 for create, save and the date verb ([R8 notice addition](../../002-notes-redesign/r8-journal/contracts/journal.md#change-notice)) |

Recipient: every realtime client subscribed to exactly `notebook-changes` whose bound auth is the `users` record that owns the note. No one else.

## Which writes send a notice

| Write | Path | Sent when |
|---|---|---|
| Create | records API → `onRecordAfterCreateSuccess` | After commit |
| Content save | records API → `onRecordAfterUpdateSuccess` | After commit; never on 409 |
| Move, delete, restore | `POST /api/notebook/notes/{id}/{verb}` | After `runInTransaction` returns; never on 400, 404, 409, 410 |
| Pin, unpin | `POST /api/notebook/notes/{id}/pin` | After `runInTransaction` returns, including a same-value pin |
| Folder delete | `DELETE /api/collections/folders/records/{id}` | One notice per affected note, after the transaction |
| Purge, superuser delete | cron, admin | No notice (not visible in any list but Recently Deleted, which re-reads on focus) |

## Open-note state on a notice (client)

The draft's **baseline** is the last saved note it confirmed (`NoteDraft.baseline`). **Busy** means a save is running, a pin request is in flight, a note action is pending, a leave or sign-out choice is open, or the conflict dialog is showing.

| State | Notice | Result |
|---|---|---|
| any | `revision` below baseline, or equal with same folder, not deleted, `pinned` and `journal_date` absent or equal to local | Ignored: own echo or stale |
| busy | anything else | Kept as the newest notice; checked again when no longer busy |
| not busy | anything else | Pause autosave, read the note, apply `remote()` ([research §4](research.md#4-a-remote-change-versus-the-pending-and-in-flight-autosave)), resume |

`remote()` outcomes: pin only; adopt folder and revision (clean or dirty, when body and attachments equal the baseline); replace (clean); conflict (dirty); unavailable (404 or deleted).

## List views

| View | On a notice or catch-up |
|---|---|
| Folder, All Notes, Pinned, search results | Re-read the current page once per 250 ms merge window, keeping the shown rows until the new ones arrive |
| Recently Deleted | Quiet re-read (the existing `visibilitychange` path) |
| Folder column | Re-read on catch-up only |
