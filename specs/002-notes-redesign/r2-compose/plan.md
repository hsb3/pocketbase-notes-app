# R2 implementation plan · Folders, list and compose

**Branch** `r2-compose` · **2026-11-18** · [Scope and acceptance](spec.md) · [Work item for the replacement notebook](https://github.com/hsb3/pocketbase-notes-app/issues/37)

## Deliverable and technical context

At phone, tablet and desktop widths, a signed-in writer creates a folder and writes a note without a Save button. A second browser opens the exact acknowledged content. The two release measurements are the 390px first keystroke and the bytes sent for 20 long note previews. [Validation procedure](quickstart.md)

Use React 19, TanStack file routes, ProseKit, the installed shadcn primitives, CSS theme tokens, the singleton PocketBase JS client and generated types. The server is PocketBase 0.40.1 on SQLite with the existing ^0.28 SDK, JS migrations/hooks and protected files. Keep the Bun lockfile, cooldown and installed dependencies. [Design decisions](research.md) · [R2 model](data-model.md) · [Routes and HTTP contract](contracts/compose.md)

The worktree-local Spec Kit selector is ignored by Git. In a fresh checkout set `SPECIFY_FEATURE_DIRECTORY=specs/002-notes-redesign/r2-compose` before invoking the Spec Kit scripts.

## Constitution check

| Principle | Before research and after design |
|---|---|
| Backend first | Pass. Implement and verify migrations/hooks first, generate types from seeded PocketBase, then build consumers. Append migrations only. |
| Server-enforced privacy | Pass. Owner rules on records and files stay in force. The standard records list handler emits a computed preview; add no custom endpoint. Verify allowed, foreign and anonymous requests. |
| Preserve writing | Pass for this increment. Stable ID, revision precondition, serialized snapshots, retained edits and failed navigation cancellation. R3 owns full recovery. |
| Smallest complete change | Pass. Preserve the document schema, validation helpers and private image rendering. No new dependencies. Generate both type files with their existing generators. |
| Live verification | Pass as a plan. Named tests run against a real disposable stack. The timing gate uses both browser engines and the production bundle. Runtime results are due during implementation. |

## Backend and cutover order

1. In a new migration, visit missing defaults among ordinary `users` (bounded batches with a stable cursor or repeated missing-only query). Create the standard R1 folder using the migration transaction, owner, name, comparison key and system flag. Verify postcondition before commit. A rerun preserves IDs. Leave R1's transactional creation hook and partial unique index in place. An inconsistent reserved name fails migration visibly.
2. Add response-only `excerpt` to the list projection from already-derived original text. The first logical break follows the R1 delimiters including CRLF. Keep the portion after that break, collapse whitespace, trim, then cap at 120 Unicode code points. Never persist caller-provided previews. In the notes list-request hook, set the virtual field on each result before the standard response continuation. Compute it from trusted stored text, expose only the computed custom key, and keep `search_key` hidden. Prove this for default and projected list responses. No rewritten documents or additional rounds of detail reads.
3. Append a separate migration dropping the legacy collection. Update all notes-only attachment reference checks, including the final transactional recheck inside the cleanup cron. Remove the entries-only request hook. Keep `pb/hooks/entry-validation.js` at its existing path because an applied migration requires it during clean bootstrap. Seed plain sample notes into owned folders and prove a second seed preserves records, credentials and IDs.
4. In a seeded, capped stack, run the existing codegen command behind `make codegen`; copy out the generated file, run again and compare. The contained preparation phase builds assets before server startup, so do backend generation from the seeded API phase, before relying on a full TypeScript build. Existing UI references may fail the intermediate type-check until the switch lands. No intermediate deployment.
5. Retire all legacy consumers together on the integration branch. The [task ownership table](#wave-slicing-input) includes the seed/restore/screenshot harnesses, MFA denial check, auth/theme specs, Railway verifiers, load/performance tooling, docs and private image reader in addition to the routes and deleted features. Retain the original protected-file verifier by attaching the test file through the notes API while the upload UI is deferred. Keep failures, cleanup and privacy assertions. The immutable recovery point is `b94195fa47eb0585d120e477911c6c333509faa4` (R1 merged). Use `git show <sha>:<path>` to retrieve guards, date picker, task view, attachment UI or tests. Record that SHA in the R2 PR.

## Workspace and save loop

Use a pathless library layout under `src/routes/_authenticated/` for Folders, a list keyed by folder or `all`, and a note keyed by ID. Open All Notes on sign-in. Keep the mobile region in the URL and list position/page in navigation state. The shared shell owns the current authenticated draft across sibling routes and width changes. Direct note links resolve their actual folder from the owned note. Folder selection and list scroll never depend on downloading a note. The [route contract](contracts/compose.md) gives the widths, default destination, keyboard interactions and wire shapes.

Use the full editor schema with one editable surface. Style the first paragraph as the title, retain the original JSON on paste and wrap, keep normal Return and existing keyboard shortcuts. Disable the file upload handler; unmount Toolbar, InlineMenu, SlashMenu, BlockHandle, TableHandle and DropIndicator. Preserve existing linked private images with the owner-token blob reader. Reuse `emptyBody` and the old `bodyText()` for local text checks only where its semantics fit (it omits mention/file-only content). Never use it to derive the canonical title or a list preview. Preserve valid previously saved rich content and existing attachment IDs.

Use one shared lazy-import promise to preload and mount the editor from the list. Start preload as soon as the authenticated list mounts, including an empty folder. On a warm Compose gesture allocate one cryptographic ID, mount/focus the editor immediately and update the URL without remounting. An existing default folder should be resolved when the list loads. No network round trip is a precondition to placing the caret. A cold bundle may finish mounting later; measure warm input separately.

Debounce **500 ms** after the last edit. Keep the editor writable during I/O. A single pump compares generation numbers and can dispatch only if no request is outstanding. An ack updates the revision and row projection, never resets the editor to the submitted snapshot. A newer generation stays Pending. When idle after its debounce, dispatch the latest value only. A pending navigation bypasses the timer, joins the current write, drains later edits and rechecks before releasing the router blocker. Newly empty drafts produce no POST. Rejected writes retain the draft and visible error and stop the transition. Editing during a create then clearing it must never misclassify an already-submitted create as a pristine draft. [Draft invariants](data-model.md)

## Test entry points and release boundary

Use `make test-api-contained` and `make test-browser-contained` for every R2 behavioral test locally and in CI. Default discovery already includes `tests/e2e/notes.spec.cjs` and the dedicated timing spec. Keep the release, load-capacity campaign and physical-device gate separate. Carry obsolete fixtures/selectors forward in their respective tools. A locally exercised operator script gets labeled local proof; production Railway verification remains pending until an authorized deployment.

The API runner needs a staged migration fixture and reproducible codegen export. Current CI also runs explicit signup, credential bootstrap/reset and restore drills outside the two targets. Preserve those positives and denials while routing execution through the two targets, including the local-only operator browser checks. Split independent modes into separate disposable invocations in CI if needed to preserve each 29-minute teardown deadline. Browser binaries, built app, Bun helpers and temporary restore/proxy servers execute inside capped containers with internal loopback, generated credentials, no published ports or host Docker socket. Make the tests exercise the real commands instead of skipping Docker-dependent assertions. Preserve amd64/arm64, both engines, nonzero exits and labeled cleanup. Use stdout for numeric metrics and copy the selected review screenshots before successful teardown.

The shell includes no Search, Move, Delete, Retry workflow, Pin, Journal, Open Tasks, formatting bar, upload UI or focus/collapse controls. R2 ships as a single later PR to main under the already approved temporary reduction in features. This planning commit authorizes neither deployment nor execution of the drop on a live instance.

## Wave slicing input

Each path below is relative to the repository root. Numbers in parentheses are approximate whole-file **decimal kB**, rounded up from the R1 checkout for existing files or estimated for new files. Deleted and generated files count at full size. Totals are planning inputs; remeasure at handoff and combine only disjoint tasks that still fit **10 unique files and 100 kB**. An implementation PR may contain several sequential waves. Shared files require sequential ownership transfer. Read-only context and uncommitted proof outputs do not count as owned source files.

| Task | Owned files (kB each) | Files / kB | Shared with |
|---|---|---:|---|
| T001 | `scripts/test-r2-upgrade.sh` (4), `scripts/run-contained.sh` (5) | 2 / 9 | T010, T023 |
| T002 | `tests/e2e/notes.spec.cjs` (15) | 1 / 15 | T011 |
| T003 | `tests/e2e/compose-timing.spec.cjs` (5) | 1 / 5 | — |
| T004 | `scripts/test-notes.ts` (24) | 1 / 24 | T008 |
| T005 | `pb/migrations/1795000100_ensure_default_folders.js` (2) | 1 / 2 | — |
| T006 | `pb/hooks/notes.pb.js` (4) | 1 / 4 | — |
| T007 | `pb/migrations/1795000200_drop_entries.js` (1), `pb/hooks/entries.pb.js` (2), `pb/hooks/attachment-cleanup.js` (1), `pb/hooks/attachments.pb.js` (1) | 4 / 5 | — |
| T008 | `scripts/test-attachments.ts` (10), `scripts/test-mfa.ts` (13), `scripts/test-notes.ts` (24), `scripts/test-entries.ts` (7) | 4 / 54 | T004 |
| T009 | `scripts/seed-entries.ts` (4), `scripts/seed-notes.ts` (3), `scripts/seed.ts` (5), `scripts/test-seed.ts` (5), `scripts/local-target.test.ts` (5), `package.json` (3), `.env.example` (5) | 7 / 30 | T023 |
| T010 | `src/services/pocketbase-types.ts` (8), `scripts/run-contained.sh` (5) | 2 / 13 | T001, T023 |
| T011 | `src/features/folders/data.ts` (2), `src/features/notes/data.ts` (3), `tests/e2e/notes.spec.cjs` (15) | 3 / 20 | T002 |
| T012 | `src/components/editor/examples/full/editor.tsx` (3), `src/components/editor/examples/full/extension.ts` (3), `src/components/editor/ui/image-view/image-view.tsx` (5), `src/features/notes/attachment-blob.ts` (1) | 4 / 12 | — |
| T013 | `src/features/notes/draft.ts` (5) | 1 / 5 | — |
| T014 | `src/features/notes/note-editor.tsx` (4), `src/features/notes/note-list.tsx` (4), `src/features/folders/folder-list.tsx` (4) | 3 / 12 | T016 |
| T015 | `src/routes/_authenticated/_library.tsx` (1), `src/routes/_authenticated/_library.folders.index.tsx` (1), `src/routes/_authenticated/_library.folders.$folderId.tsx` (1), `src/routes/_authenticated/_library.notes.$noteId.tsx` (1), `src/features/notes/workspace.tsx` (6), `src/routes/index.tsx` (1), `src/routes/_authenticated/dashboard.tsx` (1), `src/route-tree.gen.ts` (16) | 8 / 28 | T016, T017 |
| T016 | `src/features/notes/workspace.tsx` (6), `src/features/folders/folder-list.tsx` (4) | 2 / 10 | T015, T014 |
| T017 | `src/routes/_authenticated/entries.tsx` (1), `src/routes/_authenticated/entries.index.tsx` (1), `src/routes/_authenticated/entries.new.tsx` (1), `src/routes/_authenticated/entries.$entryId.tsx` (1), `src/routes/_authenticated/entries.tasks.tsx` (1), `src/components/app-sidebar.tsx` (13), `src/route-tree.gen.ts` (16) | 7 / 34 | T015 |
| T018 | `src/features/entries/attachment-list.tsx` (3), `src/features/entries/attachments.ts` (3), `src/features/entries/data.ts` (3), `src/features/entries/date-picker.tsx` (3), `src/features/entries/entry-editor.tsx` (25), `src/features/entries/workspace.tsx` (6), `src/features/tasks/data.ts` (2), `src/features/tasks/open-tasks.tsx` (5), `src/styles/globals.css` (7) | 9 / 57 | — |
| T019 | `tests/e2e/smoke.spec.cjs` (2), `tests/e2e/admin-shortcut.spec.cjs` (4), `tests/e2e/auth-regressions.spec.cjs` (4), `tests/e2e/registration.spec.cjs` (2), `tests/e2e/theme.spec.cjs` (7), `tests/e2e/two-step.spec.cjs` (7), `tests/e2e/notebook.spec.cjs` (15), `tests/e2e/tasks.spec.cjs` (9), `tests/e2e/attachments.spec.cjs` (6) | 9 / 56 | — |
| T020 | `deploy/railway/verify-app.ts` (4), `deploy/railway/verify-restore.ts` (3), `deploy/railway/verify-signup.ts` (3), `scripts/test-deployment-accounts.ts` (8), `scripts/test-restore.ts` (6) | 5 / 24 | — |
| T021 | `tests/load/k6/script.js` (20), `docs/testing/load-testing.md` (14), `tests/performance/editor.spec.cjs` (10) | 3 / 44 | — |
| T022 | `tests/screenshots/capture.cjs` (10), `scripts/capture-screenshots.sh` (2) | 2 / 12 | — |
| T023 | `scripts/run-contained.sh` (5), `deploy/local/prepare-test.sh` (1), `deploy/local/docker-compose-test.yml` (2), `scripts/seed.ts` (5) | 4 / 13 | T001, T010, T009 |
| T024 | `.github/workflows/ci.yml` (6), `Makefile` (9) | 2 / 15 | — |
| T025 | `docs/features/notes.md` (4), `docs/features/tasks.md` (3), `docs/features/attachments.md` (4), `docs/design/notes-journal.md` (11), `docs/design/prebuilt-ui.md` (7), `docs/architecture/spec.md` (2), `README.md` (7), `AGENTS.md` (6), `CHANGELOG.md` (8) | 9 / 52 | — |
| T026 | `docs/testing/verification.md` (15), `docs/ci/checks-and-rules.md` (8), `docs/development/setup.md` (6), `docs/development/root-files.md` (18), `deploy/OPERATIONS.md` (8), `deploy/RAILWAY.md` (7), `.agents/context/build.md` (2), `.agents/context/docs.md` (4) | 8 / 68 | — |
| T027 | `specs/002-notes-redesign/r2-compose/tasks.md` (19) | 1 / 19 | — |

Shared-file handoffs: `scripts/run-contained.sh` T001 → T010 → T023. `tests/e2e/notes.spec.cjs` T002 → T011. `scripts/test-notes.ts` T004 → T008. `scripts/seed.ts` T009 → T023. `src/features/folders/folder-list.tsx` T014 → T016. `src/features/notes/workspace.tsx` T015 → T016. `src/route-tree.gen.ts` T015 → T017. Run T027 last; review successful gate evidence before marking any box complete.
