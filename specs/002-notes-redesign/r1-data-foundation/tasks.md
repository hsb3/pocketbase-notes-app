# Tasks: R1 private folders and notes

## Phase 1 — Setup

- [ ] T001 In `deploy/local/docker-compose.yml` and `deploy/local/docker-compose-full.yml`, verify effective Compose config without printing secrets; prepare the disposable environment described in `quickstart.md`. Record inherited CPU, memory, PID limits, deadlines, auto-removal and cleanup. Establish how the old full suite and admin browser will run within these constraints; report any blocked gate.
- [ ] T002 Baseline the existing `scripts/test-entries.ts`, `scripts/test-attachments.ts` and `tests/e2e/notebook.spec.cjs` on the unchanged stack. Preserve the results. No upgrade fixture: the owner confirmed no user data and no backward compatibility (2026-11-18).

## Phase 2 — Foundational tests and schema

- [ ] T003 In `scripts/test-notes.ts` build the local-only A/B/anonymous harness, independent clients with auto-cancellation disabled, unique synthetic records and finally cleanup. Add named positive/negative tests from `contracts/records.md` and `research.md`. Run on the pre-change backend and record red evidence; for hook-specific assertions also capture failures after schema creation but before installing the hook.
  - [x] Folder harness, access matrix, Unicode races, protected deletion and provisioning rollback. Notes cases remain open.
- [x] T004 Hand-write new migrations in `pb/migrations/` for folders and notes with list/view/create/update/delete rules from `contracts/records.md`. Both have IDs of exactly 15 lowercase ASCII letters/digits, immutable required single user and server timestamps. Folders have trimmed name (1–80 Unicode code points), computed name_key unique per owner, boolean is_default and a unique partial index on owner where default is true. Do not edit existing migrations.
- [x] T005 Complete the new notes schema in `pb/migrations/`: single non-cascading, schema-optional folder; required full body (maximum encoded size 102400 bytes); 0–20 unique attachments; positive integral revision starting at 1; empty protected deleted date; title up to 160 Unicode code points; original text and normalized search_key sized for all valid documents; exact nonnegative open_tasks and tasks JSON (first 100, path and label up to 200 characters). No pinned or journal_date columns.

## Phase 3 — US1 (P1): store private notes safely

**Independent test.** With a disposable seeded account, create a named folder and stable-ID note. Fetch it, race two revisions, reject cross-account access and retain only the winning edit. The existing entries UI must still work.

- [x] T006 [P] [US1] In `pb/hooks/folders.pb.js` normalize the display name and compute its key. Protect default and owner; reject reserved names including Notes, All Notes, Pinned, Journal, Open Tasks and Recently Deleted. Enforce unique names during concurrent inserts, forbid default/nonempty deletion and recheck emptiness within the deletion transaction. Provide one reusable comparison function for note search text.
- [x] T007 [P] [US1] In `pb/hooks/notes.pb.js` and `pb/hooks/entry-validation.js` reuse existing body/task validation without changing entries behavior. Derive title/text from visible content and exact counts/capped tasks from the complete document; reject mismatched files, invalid/empty/oversized bodies. Use the T003 fixtures to exercise hard breaks, blank leading block, wrapped titles, styled inline runs, attachment-only notes, long non-ASCII input and forged projections in `scripts/test-notes.ts` (tests authored in T003).
- [x] T008 [US1] In `pb/hooks/folders.pb.js` create the protected Notes folder in the ordinary user’s creation transaction; a failed folder insert must roll back signup. Verify enabled signup, seeded and admin-created ordinary users each receive exactly one, a failed folder creation rolls the user insert back, and the existing signup gate in `pb/hooks/signup.pb.js` still refuses disabled public signup.
- [x] T009 [US1] In `pb/hooks/notes.pb.js` derive search_key via the same canonicalization as folder keys; enforce owned active folder, immutable ownership, immutable folder after create in R1, empty protected deleted and blocked hard delete. Create revision 1; read the stored revision and commit the next revision in one writer transaction. Confirm stale/missing preconditions yield 409 and unchanged data.
- [x] T010 [US1] Prove the two risk decisions in `scripts/test-notes.ts`: deterministic input IDs survive duplicate and competing creates, same-account read-back distinguishes changed content from acknowledgement, foreign IDs grant no access, Unicode folder comparisons and normalized literal text queries pass on the pinned build. Verify positive controls and every operation for both collections, including authorized empty-folder deletion and protected-note deletion refusal. Record response codes and record counts.
- [ ] T011 [US1] In `pb/hooks/attachments.pb.js` and `pb/hooks/attachment-cleanup.js` check both collections in the direct deletion guard, SQL candidate selection and final transaction recheck. Update `scripts/test-attachments.ts` to prove entries-only and notes-only references survive, truly orphaned uploads remain eligible, and other accounts cannot download/reference the protected file.

## Phase 4 — Integration and release checks

- [ ] T012 Use `scripts/codegen.ts` via the codegen workflow against the seeded R1 database; commit generated `src/services/pocketbase-types.ts`. Check a second generation has no diff. In `package.json` include `scripts/test-notes.ts` in test:api, preserving every existing command; update `docs/development/root-files.md`.
- [ ] T013 Document R1 backend behavior in `docs/features/notes.md`, add its link in `.vitepress/config.ts`, update `docs/testing/verification.md` and `CHANGELOG.md`. Distinguish live backend capabilities from the existing entries UI.
- [ ] T014 Follow `quickstart.md` on a fresh disposable stack. Run lint, knip, scripts type-check, build, docs build, context check and existing live API/browser regressions plus R1 tests. Retain red/green exits and inspect cleanup. Do not mark acceptance with a blocked gate. Prepare the R1 evidence for the single eventual increment PR.

## Dependencies, parallel opportunities and delivery

T001 → T002 → T003 → T004 → T005. T006 and T007 can run in parallel after schema setup, with T007 consuming the comparison function only at integration in T009. T008 follows T006. T009 requires T006 and T007. T010 needs both T008 and T009. T011 can start after T005 with independent attachment fixtures. T012 needs the complete backend; T013 can then accompany verification. T014 closes the sole R1 story. The MVP for this increment is the records round trip; the user-facing capture loop follows in later increments.
