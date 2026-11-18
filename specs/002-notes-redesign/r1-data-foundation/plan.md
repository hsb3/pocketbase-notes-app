# Implementation Plan: R1 private folders and notes

**Branch** `002-notes-redesign` · **Status** ready for implementation review · [Scope](spec.md) · [Tracking issue: private folders and notes](https://github.com/hsb3/pocketbase-notes-app/issues/35)

## Summary

Ship an additive records interface beside entries. A disposable account must receive its own Notes folder, write a document and win at most one of two simultaneous edits. A second account and a signed-out client must fail to access it. The old application remains usable throughout R1.

## Technical Context

PocketBase 0.40.1 and the existing SDK ^0.28; SQLite, server-side JavaScript hooks and Bun API checks. Use the existing admin UI to generate new migrations, retain the full document format and regenerate TypeScript declarations from the seeded local instance. No new runtime dependency or frontend feature. Test both the fresh database and applying the migration to a database with the previous schema and synthetic entries. No production backfill.

## Constitution Check

| Principle | Design gate | Implementation evidence required |
|---|---|---|
| Backend first | PASS. Add schema, model constraints and hooks before codegen. | New migration only, fresh/upgrade run and generated diff. |
| Locked by default | PASS. Specify all ten rules; protected fields and ownership checks are enforced on writes. | Owner positive controls, anonymous and second-account denials, protected file download and cleanup tests. |
| Preserve drafts | PASS. All note updates compare revisions inside a writer transaction. Direct hard delete is blocked. | Concurrent writers, replayed create, stale update; confirm winner and record count. UI draft recovery is R3. |
| Minimal change | PASS. Reuse body and task validators, request-transaction pattern and existing file storage. | Existing entries, auth and file suites still pass. No changes to existing applied migrations. |
| Live verification | PASS for design. Container policy and outstanding runner gaps are explicit in the [quickstart](quickstart.md). | Fresh numeric exits and scoped cleanup. No implementation acceptance while a required gate remains blocked. |

Post-design review: the model and contracts satisfy all five gates. No constitutional exception. Runtime gates remain to be executed.

## Project Structure

- **Schema and generation.** New admin-generated migration file(s) in `pb/migrations/`; generate `src/services/pocketbase-types.ts` via the existing codegen workflow. The resulting types include entries, folders and notes.
- **Server hooks.** Add `pb/hooks/folders.pb.js` for name, default and lifecycle guards and ordinary-user provisioning. Add `pb/hooks/notes.pb.js` plus a small projection helper where required. Keep `pb/hooks/entries.pb.js` and the entries date contract intact. Reuse `body()` and `tasks()` from `pb/hooks/entry-validation.js`.
- **Files.** Extend `pb/hooks/attachments.pb.js` and `pb/hooks/attachment-cleanup.js` in all three reference checks (delete request, candidate selection and final recheck), retaining the existing transaction and cleanup limits.
- **Checks and docs.** `scripts/test-notes.ts` uses the local-only guard and disposable accounts from the entries suite. Adjust the cleanup fixture in `scripts/test-attachments.ts`; add the new suite to the existing API gate in `package.json`. Document the records behavior under `docs/features/`, the verification entry point and changelog.

## Execution order

1. **Prove boundaries first.** Capture old suite baseline and watch focused regression cases fail on the old behavior. Resolve the two risk checks against the pinned runtime as early as the schema permits. [Decisions](research.md)
2. **Create the model.** Introduce owner rules and indexes at collection creation. Provision exactly one default per newly created ordinary user, including seed and administrative paths. [Field ownership through R11](data-model.md)
3. **Protect writes and files.** Validate the folder of each active note, derive projections, control revisions, block premature deletion and protect all references. Exercise each positive operation and each denial. [Interface contract](contracts/records.md)
4. **Verify coexistence.** Regenerate types, run the full existing suite and record numeric evidence. The R1 PR to main also carries the approved parent spec and version map. No tag, deployment or deployed soak. R2 begins on its own branch/worktree off main; R6 is the first milestone gate.

## Complexity Tracking

One extra comparison key per searchable entity avoids installing a database collation extension and avoids a search backfill. Keep the unmodified text for display. Future fields and transitions listed in the contract belong to their tagged increments.
