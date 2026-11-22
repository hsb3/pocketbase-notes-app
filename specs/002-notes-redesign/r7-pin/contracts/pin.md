# R7 contract · Pin action and list reads

## API

Each route below extends the [R5 action contract](../../r5-recover/contracts/actions.md). Its rules on auth, 401/403/404, private no-store responses, bound values and "no failure writes" all apply here. Pin is metadata-only (constitution III 2.0.0): it neither takes nor changes a revision.

| Method and path | Request | Success |
|---|---|---|
| `POST /api/notebook/notes/{id}/pin` | JSON object with exactly `pinned` (boolean) | 200 with `id, user, folder, deleted, revision, pinned`. `revision` is unchanged. A same-value request writes nothing. |
| `POST …/move`, `…/delete`, `…/restore` | Unchanged | Unchanged projection, without `pinned`. They keep their R5 revision rules. |

Errors:

- **No 409.** Pin is never refused for a stale version, and it never causes a 409 on a later content save.
- **400:** the body is malformed, has an unknown key, has a non-boolean `pinned`, or the note is deleted.
- **404:** the note is foreign or missing, with the same message for both.
- **401:** guest. **403:** a non-`users` auth collection.
- **500:** a corrupt `deleted` value (R5 integrity rule).

Ordinary record routes:

- Create with any `pinned` key is refused by the collection rule.
- Update that changes `pinned` is refused by the collection rule.
- Owner list and detail reads return `pinned`. Other accounts see no rows.

## Client reads

| Function (`src/features/notes/data.ts`) | Change |
|---|---|
| `listNotes(folder, page)` | Adds `pinned` to `fields`. Sort is `-pinned,-updated,-id`. `folder === "pinned"` filters `deleted = "" && pinned = true` and sorts `-updated,-id`. |
| `getNote` | Adds `pinned` to `detailFields` and to the validated `Detail` shape. |
| `searchNotes` | Unchanged. |

## Client action

- **Request:** a new `setPin(id, pinned, session)` in `src/features/notes/actions.ts` posts `{ pinned }` through the same private, uncached request options as R5 actions. It accepts the reply only when it shows the same owner and note and `pinned === requested`.
- **Not used:** R5's `NoteCommand`, `confirms`, revision adoption and "Check again". The draft, its revision and autosave are untouched.
- **Menu item:** Pin / Unpin in `src/features/notes/note-actions.tsx`, labelled from the note's current `pinned`, which is held beside the draft and not in its save baseline. While a request is in flight the item is disabled.
- **On success:**
  1. Update the local `pinned`.
  2. Refresh the list.
  3. Announce "Pinned." or "Unpinned."
  4. Return focus to `#note-actions`.
- **On failure** (network error, timeout or 5xx):
  - Keep the old state.
  - Show "Could not pin this note. Try again." with a Retry that resends the same absolute value, which is safe whether or not the first request landed.
  - A 404 uses R5's missing-note handling. A 400 for a deleted note refreshes the note.

## UI

- **Folder list:** a new "Pinned" item (lucide `Pin` icon) between All Notes and the real folders.
- **Note row:**
  - A pinned row shows a `Pin` icon with the accessible text "Pinned".
  - In the Pinned view each row also shows its folder name, using the line already used for search hits.
- **Pinned empty state:** "No pinned notes", with the hint "Pin a note from its actions menu."
- **Layout:** works at 390, 810 and 1440 px, by keyboard, in both themes. No horizontal scrolling.
