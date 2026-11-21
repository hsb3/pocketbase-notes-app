# R7 research · Pin

No item in the plan's technical context was left open. Each decision below was settled by reading the current code on `main` (`b895d10`).

## 1. Where the pin is written

- **Decision.** Add a `pin` verb to the existing action route, `POST /api/notebook/notes/{id}/pin`, in `pb/hooks/note-actions.pb.js`. The body is `{ pinned }`, with no revision. Inside the transaction, the handler:
  - checks that the caller owns the note;
  - checks the raw date and that the note is active;
  - runs one bound `UPDATE notes SET pinned={:pinned} WHERE id={:id} AND user={:user} AND deleted=''`.
- **Rationale.**
  - Constitution III, as amended to 2.0.0 on 2026-11-21, makes pin a metadata-only write: it must not use or advance the content revision.
  - Raw SQL also leaves the PocketBase `updated` autodate alone. That gives FR-005 (a pin is not an edit) for free.
  - The route already has the owner, raw-date and transaction guards.
- **Alternatives rejected.**
  - *Plain record PATCH:* it bumps `updated` and runs the content hooks.
  - *A separate route file:* it would duplicate the guards.

## 2. Pin and the content revision

- **Decision.** A pin neither checks nor advances `revision`.
- **Rationale.**
  - **Prior art:** the [sync evaluation](../../../docs/architecture/evaluations/sync-and-presence/report.md) shows that putting metadata in the content's version causes false conflicts (Standard Notes, Joplin, Bear). It also shows that Figma and Linear avoid this with per-property last-writer-wins.
  - **No lost update is possible:** `pinned` is an absolute value, and the write touches no content column.
  - **Open editor:** its draft, revision and autosave are unaffected.
  - **Other devices:** a device with the same note open keeps saving with no 409. It sees the new pin state on its next list or note read. Pushing that change live belongs to the planned live-updates increment, not R7.
- **Rejected (the previous plan).** *Advance the revision like move.* It made another device's next save get R3's 409 conflict dialog. That is exactly the false conflict the evaluation found.

## 3. Idempotency and lost replies

- **Decision.** Setting the value the note already has returns 200 with nothing written.
  - Because the value is absolute, the client can resend after an unknown outcome (network error or timeout) without a "Check again" step: the result is the same either way.
  - The server orders concurrent pins from two devices, and the last one received wins.
- **Rationale.** This does not need R5's command pipeline and reconciliation. Those exist because move, delete and restore are refused against a stale revision.

## 4. Blocking forged pins through the ordinary record API

- **Decision.** Extend the notes `createRule` with `@request.body.pinned:isset = false` and the `updateRule` with `@request.body.pinned:changed = false`. The migration asserts the exact previous rule strings before changing them, following the `1795000400` pattern.
- **Rationale.** This is the same mechanism that already protects `folder` and `deleted`. A new note is therefore always unpinned (FR-008, FR-009). The default value of a bool field is `false`.

## 5. Ordering and index

- **Decision.** Folder lists and All Notes sort by `-pinned,-updated,-id`. Pinned filters on `deleted = "" && pinned = true` and sorts by `-updated,-id`. Search keeps `-updated,-id`. Add a partial index `idx_notes_active_pinned ON notes (user, pinned, updated, id) WHERE deleted = ''`.
- **Rationale.** A single sort keeps the 20-row pages stable across the boundary between the pinned and unpinned groups, so the client needs no second query. W1 records `EXPLAIN QUERY PLAN` for the three list shapes, with no temporary sort expected on Pinned. If a folder list does need a temporary sort, accept it at personal-library scale and note it in the W1 evidence; it is not a blocker.
- **Alternative rejected.** *Two queries per folder (pinned first, then unpinned).* That doubles the requests and makes page arithmetic harder.

## 6. Pinned view routing

- **Decision.** Add a pseudo-folder ID `pinned` next to `all` and `recently-deleted` in `src/features/folders/folder-list.tsx` and `src/features/notes/workspace.tsx`. Compose from `pinned` files in the default folder, exactly as `all` does.
- **Rationale.** Real record IDs are 15 characters long, so `pinned` cannot collide with a real folder. No new route file is needed.

## 7. Move, delete, restore and purge

- **Decision.** No code change. None of those `UPDATE` statements, nor the folder-delete hook, touches `pinned`. W2 adds API assertions that the value survives each one (FR-007).
