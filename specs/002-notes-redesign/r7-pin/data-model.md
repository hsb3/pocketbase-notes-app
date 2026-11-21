# R7 data model · Pin

## Note: one new field

| Field | Type | Default | Who writes it |
|---|---|---|---|
| `pinned` | bool | `false` | Only `POST /api/notebook/notes/{id}/pin`. Ordinary create sends no `pinned` (rule `@request.body.pinned:isset = false`), and ordinary update cannot change it (rule `@request.body.pinned:changed = false`). |

Every other field and rule from [R5](../r5-recover/data-model.md) stays as it is. The list and view rules are owner-only already, so `pinned` is never readable by another account or a guest.

## Write set

| Successful write | Preconditions (inside the transaction) | Exact changes |
|---|---|---|
| Pin / unpin | Owner; note active; `pinned` is a JSON boolean. No revision is sent or checked (constitution III, metadata-only). | Set `pinned`. `revision` is never changed. If the value already matches, nothing is written. Last change wins between devices. |
| Move, delete, folder delete, restore | Unchanged from R5 | Unchanged. `pinned` is preserved byte for byte. |
| Content save | Unchanged from R3 | Unchanged. `pinned` cannot change. |
| Purge | Unchanged from R5 | The row is removed along with its pin. |

A pin leaves `revision` and `created`, `updated`, `body`, `title`, `text`, `search_key`, `tasks`, `open_tasks`, `folder`, `deleted` and `attachments` unchanged.

## Index

`idx_notes_active_pinned ON notes (user, pinned, updated, id) WHERE deleted = ''`. Existing indexes are kept.

## Views (stored nowhere)

| View | Filter | Sort |
|---|---|---|
| A folder | owner, `deleted = ""`, `folder = X` | `-pinned,-updated,-id` |
| All Notes | owner, `deleted = ""` | `-pinned,-updated,-id` |
| Pinned | owner, `deleted = ""`, `pinned = true` | `-updated,-id` |
| Search | unchanged (R4) | `-updated,-id` |
| Recently Deleted | unchanged (R5) | unchanged |

## Migration and rollback

`pb/migrations/1795000500_note_pins.js`:

- **Up:** assert the current notes create and update rules equal the R5 strings and that `idx_notes_active_pinned` does not exist; then add the field, the index and both rule clauses.
- **Down:** assert the R7 state, then remove all three.
- **Unexpected state:** either direction throws and leaves nothing changed, following the pattern of `1795000400`.
- **Existing rows:** they read `false` after up. No backfill is needed, because no user data exists (parent spec assumption).
