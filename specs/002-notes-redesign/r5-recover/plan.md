# R5 implementation plan · Move, delete and recover

**Branch** r5-recover · **Base** ed784ca · **2026-11-19** · [Scope and acceptance](spec.md) · [Move, delete and recover notes, issue 40](https://github.com/hsb3/pocketbase-notes-app/issues/40)

Keep the open note's identity through a move. Preserve writing and private attachments through individual and whole-folder deletion. The owner can restore strictly before 30 elapsed days. Confirm success with independent reads of the original ID, surviving bytes, revision, folder, deadline and search result. Exercise cancellation and competing actions at 390, 810 and 1440 CSS px on Chromium and WebKit. [Task ledger](tasks.md) · [R1 records](../r1-data-foundation/contracts/records.md) · [R2 Compose](../r2-compose/contracts/compose.md) · [R3 draft and navigation](../r3-resilience/contracts/editor.md) · [R4 search and return](../r4-search/contracts/search.md)

## Design

1. **Keep active reads and the retention clock on the server.** Tighten the notes list rule and add a partial index for the daily expiry range. Exclude tombstones from active collection lists, folder lists and search totals/snippets. A valid tombstone stays owner-readable by direct ID until purge. Expansion follows the target view rule. Preserve existing sorting and the R4 comparison key. The trash read has its own owner check, server cutoff, bounded projection and stable page order. [Measured query plans and rejected alternatives](research.md)
2. **Separate a content save from a metadata transition.** Use the singleton PocketBase client and three explicit note commands. Check the current revision and owner, update the exact columns in one transaction and return the acknowledged state. Preserve created/updated across metadata changes to keep edit ordering stable. Reconcile uncertain replies against owner reads. [State transitions](data-model.md) · [API contract](contracts/actions.md)
3. **Delete exactly what the writer confirmed.** Hash all linked note IDs, revisions and deletion instants, including previously deleted members. Revalidate the digest inside the existing folder-delete hook. Detach all members, trash active members at the same instant and remove the folder atomically. Already-deleted members keep their own deadline. The permanent Notes folder receives surviving restorations. The purge validates raw stored UTC text, advances its (deleted,id) cursor even past invalid rows, and checks every surviving note reference. Before physical deletion it logs the owner, note and exact exclusive keys. PocketBase handles post-commit cleanup. Its logged prefix failures may leave unreachable bytes in private storage until the operator follows the runbook. [Transaction and file gates](quickstart.md#live-api)
4. **Keep writing available during interruptions.** A shadcn menu, move sheet and confirmation dialogs use local overlay state. Note actions serialize with R3's autosave and carry the post-flush revision. Acknowledged move updates the current draft in place. Folder deletion lives on the selected custom folder list. W5 builds the new trash screen on the existing generic folder route. The owner workspace keeps Check again available when an initiating row or header disappears. Every changed control has a history action, guard and focus target. [Navigation and copy recovery](contracts/navigation.md)

React 19, TypeScript, TanStack Router, ProseKit, shadcn and Bun remain the client stack. The pinned PocketBase 0.40.1 server, SDK 0.28.x, SQLite, Goja hooks and existing RustFS test storage supply the backend. No new production runtime or dependency.

## Constitution check

| Gate | Intake and post-design result |
|---|---|
| Backend before UI | W1 adds a schema-reversible migration, staged plus fresh checks and double codegen. W2/W3 close API, retention and race gates before editor integration. |
| Ownership and validation | All five existing rules accounted for in the model. The new reads/actions independently require users auth and check ownership before state. Standard PATCH remains protected. Positive and denied cases use genuine clients. |
| Preserve writing | Revision checks cover individual and bulk writes. No metadata operation reserializes content. R3 session-bound drafts, copy and explicit discard remain available. |
| Small change | Existing route topology, R4 key/index, private attachment checks, UI primitives and editor controls reused. No applied migration edits. Generated files only through project commands. |
| Observable delivery | Each functional wave begins with substantive red tests, ends buildable and passes its contained gate. R6 owns the separate physical-device and stabilization evidence. |

The approved recovery policy settles retention, fallback, folder removal and operator cleanup of storage leftovers. No additional product ruling is required for this scope. The coordinator integrates one PR for the increment after verification. The planning commit contains specifications only.

## Wave slicing input

One fresh agent owns each wave. The cap is **10 distinct whole files written to the checkout and 100 decimal kB** of their final sizes, aiming for 85 kB. Count a generator copy/writeback even if byte-identical. Reading, comparing, or generating only in a disposable container counts zero. The API runner compares generated types; only W1 codegen copies them back. Vite normally reads an identical route tree without writing. Verify that on build; an actual writeback needs generator-only ownership and budget even at identical content. On unexpected output stop and re-slice before handoff. Test captures, build products, caches and transcripts go to disposable or external output directories; perform verification that produces these in a disposable copy of the exact candidate, preserving evidence of its source. The cap measures files delivered or rewritten in the working checkout. Recheck measured sizes before each dispatch and exit.

Full paths are repository-relative. Each row is the task's complete allowlist. Earlier waves transfer their files to later owners in order. [Exact commands and evidence](quickstart.md#exit-commands)

| Wave / task | Create / Modify / generator-only (whole-file kB) | Required result |
|---|---|---|
| W1 T001 | Modify `scripts/test-r2-upgrade.sh` (25), `scripts/test-notes.ts` (41). Create `scripts/test-note-actions.ts` (2). | Register a real active-list/tombstone test in the normal case loop, update the two visibility dates, retain R4’s positive inclusion and observe the new exclusion fail. [Staged checks](quickstart.md#staged-upgrade) |
| W1 T002 | Create `pb/migrations/1795000400_active_notes_and_purge.js` (3). Generator-only `src/services/pocketbase-types.ts` (7). | Double codegen, active-list exclusion, schema down/up and post-write row equality. |
| W2 T003 | Modify `scripts/test-note-actions.ts` (12), `scripts/test-r2-upgrade.sh` (27). | Exercise substantive handler reds, raw dates, private reads, stale revisions and exact UTC boundaries. [API gates](quickstart.md#live-api) |
| W2 T004 | Create `pb/hooks/note-actions.pb.js` (5), `pb/hooks/note-lifecycle.js` (5). Modify `pb/hooks/notes.pb.js` (5). | Owner action/trash endpoints and raw-date integrity on existing PATCH/detail. [Action contract](contracts/actions.md) |
| W3 T005 | Modify `scripts/test-note-actions.ts` (16), `scripts/test-attachments.ts` (16), `scripts/test-r2-upgrade.sh` (30), `scripts/run-contained.sh` (12). | Prove nonempty-folder refusal before implementation; stage the real paths for deeper reds. Isolate staged fixtures and real cron, compare keys/bytes and prove repeated drain. [Cron phase](quickstart.md#contained-cron-phase) |
| W3 T006 | Modify `pb/hooks/folders.pb.js` (6). Create `pb/hooks/note-purge.pb.js` (5). | Atomic folder delete, cursor progress, audit and PocketBase file worker. [Transaction and manual cleanup](data-model.md#clock-and-purge-progress) |
| W4 T007 | Create `tests/e2e/note-actions.spec.cjs` (11). Modify `scripts/run-contained.sh` (13). | Browser/recover profile, predecessor UI failures, keyboard outcomes and 24 captures. |
| W4 T008 | Create `src/features/notes/actions.ts` (4), `src/features/notes/note-actions.tsx` (6). Modify `src/features/notes/draft.ts` (16), `src/features/notes/note-editor.tsx` (4). | Session-bound actions, post-flush revision, baseline and copyable recovery. [Draft guard](contracts/navigation.md#pending-writing) |
| W4 T009 | Modify `src/features/notes/workspace.tsx` (20), `src/features/notes/note-list.tsx` (11). | Move clamp precedence, surviving status and focus. [Control outcomes](contracts/navigation.md#uncertain-actions) |
| W5 T010 | Create `tests/e2e/recently-deleted.spec.cjs` (13). Modify `scripts/run-contained.sh` (14). | Second suite, folder/trash keyboard reds, 60 captures. |
| W5 T011 | Create `src/features/notes/recently-deleted.tsx` (7), `src/features/folders/delete-folder.tsx` (5). Modify `src/features/folders/folder-list.tsx` (6), `src/features/notes/actions.ts` (5). | Accessible recovery rows, private preview and folder destination. [Requests and reconciliation](contracts/actions.md#interrupted-requests) |
| W5 T012 | Modify `src/features/notes/workspace.tsx` (23), `src/features/notes/note-list.tsx` (12). | Mount recovery view, preserve unresolved intent through disappearing controls and implement verified 404/Retry/focus. [Control outcomes](contracts/navigation.md#uncertain-actions) |
| W6 T013 | Modify `docs/features/notes.md` (12), `docs/features/attachments.md` (4), `docs/testing/verification.md` (21), `deploy/OPERATIONS.md` (11), `CHANGELOG.md` (10). | Describe verified behavior. Own the operator’s logged-key lookup, reference/reuse check, safe manual removal and independent stat. |
| W6 T014 | Modify `specs/002-notes-redesign/r5-recover/tasks.md` (14). | Check evidence and record actual SHAs, numeric exits and observed sizes. Only W6 writes the task ledger. |

| Handoff | Files | Estimated kB | Exit entry point |
|---|---:|---:|---|
| W1 → W2 · active lists and migration | 5 | 78 | [W1 codegen, fresh API and staged down/up](quickstart.md#w1-exit) |
| W2 → W3 · note actions | 5 | 54 | [W2 API, clock and integrity](quickstart.md#w2-exit) |
| W3 → W4 · folder and purge | 6 | 85 | [W3 folder rollback, cron and real bytes](quickstart.md#w3-exit) |
| W4 → W5 · open note | 8 | 85 | [W4 focused and default browser tests](quickstart.md#w4-exit) |
| W5 → W6 · recovery view | 8 | 85 | [W5 browser and integrated API](quickstart.md#w5-exit) |
| W6 → coordinator · verified documentation | 6 | 72 | [W6 docs and evidence](quickstart.md#w6-exit) |
