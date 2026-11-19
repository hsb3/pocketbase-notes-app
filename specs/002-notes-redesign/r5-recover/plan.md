# R5 implementation plan · Move, delete and recover

**Branch** r5-recover · **Base** ed784ca · **2026-11-19** · [Scope and acceptance](spec.md) · [Move, delete and recover notes, issue 40](https://github.com/hsb3/pocketbase-notes-app/issues/40)

Keep the open note's identity through a move. Preserve writing and private attachments through individual and whole-folder deletion. The owner can restore strictly before 30 elapsed days. Confirm success with independent reads of the original ID, surviving bytes, revision, folder, deadline and search result. Exercise cancellation and competing actions at all three widths.

## Design

1. **Keep active reads and the retention clock on the server.** Tighten the notes list rule and add a partial index for the daily expiry range. Preserve existing list/search sorting, detail checks and the R4 comparison key. The trash read has its own owner check, server cutoff, bounded projection and stable page order. [Measured query plans and rejected alternatives](research.md)
2. **Separate a content save from a metadata transition.** Use the singleton PocketBase client and three explicit note commands. Check the current revision and owner, update the exact columns in one transaction and return the acknowledged state. Preserve created/updated across metadata changes to keep edit ordering stable. Reconcile uncertain replies against owner reads. [State transitions](data-model.md) · [API contract](contracts/actions.md)
3. **Delete exactly what the writer confirmed.** Hash all linked note IDs, revisions and deletion instants, including previously deleted members. Revalidate the digest inside the existing folder-delete hook. Detach all members, trash active members at the same instant and remove the folder atomically. Already-deleted members keep their own deadline. The permanent Notes folder receives surviving restorations. The purge uses PocketBase physical deletion only after rechecking eligibility and file references. [Transaction and file gates](quickstart.md#live-api)
4. **Keep writing available during interruptions.** A shadcn menu, move sheet and confirmation dialogs use local overlay state. Note actions serialize with R3's autosave and carry the post-flush revision. Acknowledged move updates the current draft in place. Folder deletion lives on the selected custom folder list. Trash uses the existing library route. Every changed control has a history action, guard and focus target. [Navigation and copy recovery](contracts/navigation.md)

React 19, TypeScript, TanStack Router, ProseKit, shadcn and Bun remain the client stack. The pinned PocketBase 0.40.1 server, SDK 0.28.x, SQLite, Goja hooks and existing RustFS test storage supply the backend. No new production runtime or dependency.

## Constitution check

| Gate | Intake and post-design result |
|---|---|
| Backend before UI | W1 adds a new reversible migration, staged plus fresh checks and double codegen. W2/W3 close API, retention and race gates before editor integration. |
| Ownership and validation | All five existing rules accounted for in the model. The new reads/actions independently require users auth and check ownership before state. Standard PATCH remains protected. Positive and denied cases use genuine clients. |
| Preserve writing | Revision checks cover individual and bulk writes. No metadata operation reserializes content. R3 session-bound drafts, copy and explicit discard remain available. |
| Small change | Existing route topology, R4 key/index, private attachment checks, UI primitives and editor controls reused. No applied migration edits. Generated files only through project commands. |
| Observable delivery | Each functional wave begins with substantive red tests, ends buildable and passes its contained gate. R6 owns the separate physical-device and stabilization evidence. |

The approved recovery policy settles retention, fallback and folder removal. No additional product ruling is required for this scope. The coordinator integrates one PR for the increment after verification. The planning commit contains specifications only.

## Wave slicing input

One fresh agent owns each entire wave. The task rows below name its full write set. Repeated paths across waves have sequential ownership. Estimates are **whole post-edit files** in decimal kB, including generated outputs even when identical. Recheck actual bytes against 10 files / 100 kB before each handoff. If the next slice cannot fit, split at a green behavioral boundary before editing. Full paths are repository-relative. [Exit commands and retained evidence](quickstart.md#exit-commands)

| Wave / task | Owned files and budget | Handoff |
|---|---|---|
| W1 T001 | Modify `scripts/test-r2-upgrade.sh` (25) | R4 unfiltered deleted-row positive. Red at missing R5 metadata/visibility. Preserve historical stages. |
| W1 T002 | Create `pb/migrations/1795000400_active_notes_and_purge.js` (3), generator-only `src/services/pocketbase-types.ts` (7, contained codegen) | Fresh parity, observed SQL and post-write down/up green. |
| W2 T003 | Modify `scripts/test-notes.ts` (41), Create `scripts/test-note-actions.ts` (10), Modify `scripts/test-r2-upgrade.sh` (26) | Register real scenarios in existing case loop and add fixture-only JSVM clock cases. Record red before action hooks. |
| W2 T004 | Create `pb/hooks/note-actions.pb.js` (4), `pb/hooks/note-lifecycle.js` (4) | Register and implement note actions, owner trash pagination and strict deadline. |
| W3 T005 | Modify `scripts/test-note-actions.ts` (16), `scripts/test-attachments.ts` (14), `scripts/test-r2-upgrade.sh` (29) | Prove stale folder snapshots, rollback, storage states and real post-up writes. |
| W3 T006 | Modify `pb/hooks/folders.pb.js` (6), Create `pb/hooks/note-purge.pb.js` (4) | Preview + transactional DELETE and real daily cron, reusing lifecycle clock and unfiltered attachment reference checks. |
| W4 T007 | Create `tests/e2e/note-actions.spec.cjs` (10), Modify `scripts/run-contained.sh` (13) | Browser/recover profile, pre-UI failures and capture collection. |
| W4 T008 | Create `src/features/notes/actions.ts` (4), `src/features/notes/note-actions.tsx` (6), Modify `src/features/notes/draft.ts` (16), `src/features/notes/note-editor.tsx` (4) | Typed session-bound commands. Mounted controls use the editor baseline and R3 recovery. |
| W4 T009 | Modify `src/features/notes/workspace.tsx` (20), `src/features/notes/note-list.tsx` (11) | Wire guard, move in place, delete return and both ordinary/search page clamps. |
| W5 T010 | Create `tests/e2e/recently-deleted.spec.cjs` (12), Modify `scripts/run-contained.sh` (14) | Add second suite, expanded screenshot manifest and red folder/trash controls. |
| W5 T011 | Create `src/features/notes/recently-deleted.tsx` (7), `src/features/folders/delete-folder.tsx` (5), Modify `src/features/folders/folder-list.tsx` (6), `src/features/notes/actions.ts` (5) | Restore/deadline list, private preview, folder confirmation and real destination links. |
| W5 T012 | Modify `src/features/notes/workspace.tsx` (22), `src/features/notes/note-list.tsx` (12) | Render reserved destination, wire folder reloads, guarded history, post-action focus and complete acceptance. |
| W6 T013 | Modify `docs/features/notes.md` (12), `docs/features/attachments.md` (4), `docs/testing/verification.md` (21), `CHANGELOG.md` (10) | Describe delivered behavior, proof and boundaries. |
| W6 T014 | Modify `specs/002-notes-redesign/r5-recover/tasks.md` (12) | Verify artifacts, record actual SHAs/exits and close verified tasks. |

| Handoff order | Files | Estimated kB | Exit |
|---|---:|---:|---|
| W1 → W2 · storage | 3 | 35 | [W1 codegen, staged and API](quickstart.md#exit-commands) |
| W2 → W3 · note actions | 5 | 85 | [W2 API and clock](quickstart.md#exit-commands) |
| W3 → W4 · folder and purge | 5 | 69 | [W3 atomicity and storage](quickstart.md#exit-commands) |
| W4 → W5 · open note | 8 | 84 | [W4 browser and regression](quickstart.md#exit-commands) |
| W5 → W6 · recovery view | 8 | 83 | [W5 full integration](quickstart.md#exit-commands) |
| W6 → coordinator · release evidence | 5 | 59 | [W6 documentation](quickstart.md#exit-commands) |

Each behavioral exit includes the shared static and unit checks. The route tree is expected byte-identical on build. Any topology change needs a revised file budget including its generated output. Only W6 writes the task ledger. Earlier crews hand over evidence separately.
