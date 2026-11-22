# R7 quickstart · How to prove Pin works

All servers and browsers run in the project's capped containers ([testing rules](../../../docs/testing/verification.md)). Use two disposable accounts, A and B, plus a guest client.

## Commands

```sh
bun run lint && bun run knip && bun run build
make test-api-contained         # API suite, includes scripts/test-pins.ts
make test-browser-contained     # Chromium + WebKit, includes tests/e2e/pin.spec.cjs
python3 scripts/ai-context.py check && bun run docs:build   # after doc changes
```

The full gate (`.specify/extensions/functionform-gate/scripts/gate.sh full`) runs all of the above.

## W1 exit

Schema migration and generated types.

1. `make codegen` adds `pinned: boolean` to `NotesRecord` in `src/services/pocketbase-types.ts`. A second run produces no diff.
2. The staged upgrade in `scripts/test-r2-upgrade.sh` runs up, down, then up again. Rows are byte-equal, the rules and index match [the data model](data-model.md#migration-and-rollback) after each step, and the down step restores the R5 rule strings exactly.
3. Record `EXPLAIN QUERY PLAN` for the folder, All Notes and Pinned list queries.

## W2 exit

API checks in `scripts/test-pins.ts`.

| Scenario | Expected |
|---|---|
| A pins, then unpins, a note | 200; `revision`, `updated`, body and folder unchanged |
| A pins a note that is already pinned | 200; row unchanged |
| A sends a string `pinned`, or an extra key such as `revision` | 400; row unchanged |
| A pins on client 1, then saves body on client 2 with the revision read before the pin | Pin 200; body save 200 (no 409); stored pin still true |
| Clients 1 and 2 set pin true and false in sequence | The last request received wins |
| A creates a note with `pinned`, or PATCHes `pinned` | Refused; stored value unchanged |
| A pins a deleted note | 400 |
| B or the guest tries to pin A's note | 404 and 401; row unchanged |
| A runs pin → move → delete → restore | `pinned` stays true throughout |
| A deletes a folder that holds a pinned note, then restores the note | The note returns pinned, in Notes |
| List reads | Folder and All Notes put pinned rows first, each group most recently edited first; Pinned lists each active pinned note once and never a deleted one; search order is unchanged; B sees none of A's pins |

## W3 exit

Browser checks in `tests/e2e/pin.spec.cjs` at 390, 810 and 1440 px.

1. Open note C in a folder holding A, B and C. Open the note actions and choose Pin. "Pinned." is announced, focus returns to the actions button, the URL and draft are unchanged, and C shows first in the folder with the pin marker.
2. Type straight after pinning. Autosave reaches Saved, with no conflict. In a second browser context that already had the note open, typing also reaches Saved with no conflict dialog.
3. Open Pinned. C appears once with its folder name. Unpin C from its note. The Pinned list shows the empty state.
4. Compose from Pinned. The new note is filed in Notes, unpinned.
5. Pin a note, move it, delete it, then restore it. It is absent from Pinned while deleted and present once after restore.
6. Abort the pin reply after the server commits, then choose Retry. The note is pinned once, and no conflict appears.
7. Keyboard only: open the actions, choose Pin, and Escape out of the menu. Capture both themes at all three widths.

## W4 exit

Documentation.

`docs/features/notes.md` and `docs/features/folders.md` describe Pin and the Pinned view. `CHANGELOG.md` has an entry. In `versions.md` the R7 row reads `done`.
