# R2 implementation tasks

[Acceptance criteria](spec.md) · [Design and file ownership](plan.md) · [Validation](quickstart.md)

All boxes describe future implementation. C1–C6 refer to the scope table. One integration lead owns root configuration and generated files. Per-task paths, size estimates and shared ownership are in the final table of the plan. A [P] task can run alongside disjoint work once its prerequisites pass.

## 1 · Establish the failing gates

Use real signed-in sessions and the two contained Make targets. When a check depends on an R2 interface, establish the contract failure before implementing it. Record a useful failing assertion; a harness/import failure does not qualify.

- [x] T001 Record red upgrade proof in `scripts/test-r2-upgrade.sh` and call it from the API branch of `scripts/run-contained.sh`. In run-owned scratch data, apply migrations through pre-R1, insert a synthetic user and entry, apply R1, add a second already-provisioned ordinary user, a custom folder and a valid R1 note. Stage hooks appropriate to each schema. Run the actual R2 upgrades and rerun the default-folder forward operation (e.g. replay that migration under a second fixture-only filename on the disposable DB). Assert defaults by ID/key, custom data and note survive, superusers excluded and entries absent. Separately run all production migrations from empty. Before the fix demonstrate the missing folder or still-present entries, not a missing fixture script. (C1, C6)

- [ ] T002 [P] Add the red Garden capture journey to `tests/e2e/notes.spec.cjs` using the existing session fixture and API helper. Use independent sessions of the same account for persistence and a second ordinary account for the privacy control. Include the title/empty cases, exact body in an independent signed-in desktop context, a real create acknowledged three seconds late while further typing and Back are pending, normal debounce and one failed save retained. Check validity for a paste with rich content, a known private image and unchanged attachment references on reopen. Define the three-width, folder validation, pagination/scroll, keyboard Account, privacy and theme checks in the same spec. Run against the pre-cutover UI and record the first unmet behavior for each new regression. (C2, C3, C5)

- [ ] T003 [P] Add the 390px production-asset SC-001 protocol in `tests/e2e/compose-timing.spec.cjs` per quickstart. Report per-trial tap/input times, actual text, misses and totals for each engine. Prove the counter fails on a missing caret, e.g. against the old editor's separate title/body flow or by withholding warm autofocus in the implementation worktree. Remove the fault before collecting final results. (C4)

- [x] T004 [P] In `scripts/test-notes.ts` measure decoded bytes and elapsed time for a controlled 20-note page with long valid documents before/after requesting exact list fields. Assert expected body-only preview, blank/single-line, Unicode cap, stale/forged preview rejection, full detail intact, no hidden fields and A/B/anonymous denials. Use authenticated positive controls. Prove the missing preview on R1. For deleted-row exclusion, arrange a trashed row only through a disposable fixture and verify the active query excludes it. R2 exposes no trash action. (C6)

## 2 · Migrate the backend and generate its types

Deliver the backend before consumer code. The intermediate schema can be inspected using the API runner even while the old UI still targets entries. Integrate the whole increment before release.

- [x] T005 [P] Add `pb/migrations/1795000100_ensure_default_folders.js`. Provision missing defaults for every ordinary user in the migration transaction, preserving existing IDs. Reuse R1 validation/index invariants. Never undo default provisioning on rollback. Pass the default-folder half of the staged upgrade proof. (C1)

- [x] T006 [P] In `pb/hooks/notes.pb.js` use the notes list-request hook before standard enrichment to add the response-only excerpt from R1 original text. Explicitly hide all other custom data and retain hidden search_key. Validate with the red list projection test, including a note existing before the hook change. (C6)

- [x] T007 Add `pb/migrations/1795000200_drop_entries.js` after provisioning and retire `pb/hooks/entries.pb.js`. Drop the collection by its historical collection identity. Make reverse migration fail explicitly with backup recovery instructions. Preserve all past migrations and their shared validator. Move both candidate selection and transactional reference recheck in `pb/hooks/attachment-cleanup.js` and direct-delete error in `pb/hooks/attachments.pb.js` to notes only. (C6)

- [ ] T008 Port `scripts/test-attachments.ts` to real notes in owned folders, including rich documents, protected downloads, unsafe/foreign/oversized denials and real old/fresh orphan versus referenced-file cron proof. Detach through a revision-checked body/attachment update before verifying deletion. Preserve the MFA-protected collection test in `scripts/test-mfa.ts`. Replace entry-only test coverage after comparing its assertions with R1 notes tests; keep applicable validation regressions in `scripts/test-notes.ts` and remove `scripts/test-entries.ts`. (C6)

- [ ] T009 Replace `scripts/seed-entries.ts` with `scripts/seed-notes.ts` and update `scripts/seed.ts`, `scripts/test-seed.ts` and `scripts/local-target.test.ts`. Use owned folders and real documents, preserve manual records on reseed and existing credentials, run guarded local targets in containers. Migrate the `package.json` test:api chain and stale `.env.example` test override. Root config edits belong to the integration lead. (C1, C6)

- [ ] T010 Generate `src/services/pocketbase-types.ts` from a freshly migrated and seeded backend with the existing codegen script. In `scripts/run-contained.sh` use a generation-only request to copy out the single generated file; ordinary API validation compares generated output without overwriting the checkout. Check a second generation is byte-identical and entries types disappeared. (C6)

## 3 · US1 (P1) capture and reopen

Goal: one valid edit appears exactly once in the selected folder in a second browser. Independent proof: the Garden journey, delayed acknowledgement and 20 warm starts per engine in the contained browser suite.

- [ ] T011 [P] [US1] Build `src/features/folders/data.ts` and `src/features/notes/data.ts` on the existing typed pb singleton. List/create folders and resolve the unique default. Ship the active, bound folder/All Notes list query, strict summary/detail shapes, explicit pagination and stable sort. Read detail only for selection and reject inactive detail. Verify requested fields and actual network keys, including zero per-row GETs, in `tests/e2e/notes.spec.cjs`. (C1, C6)

- [ ] T012 [P] [US1] Adapt `src/components/editor/examples/full/editor.tsx` and `extension.ts` for one Note textbox with default paragraph, first-paragraph styling, native Return and focused mount. Remove toolbar/menu/handle/drop-indicator mounts and upload handling while preserving supported document nodes/keymaps. Move the existing private file reader needed by `src/components/editor/ui/image-view/image-view.tsx` into `src/features/notes/attachment-blob.ts`. Verify long wrapped/blank first lines and previously saved rich bodies. (C2, C4)

- [ ] T013 [US1] Implement `src/features/notes/draft.ts` with per-owner/note state and the 500 ms generation-aware save pump. Random stable ID, same-ID POST once, revision PATCH, immutable submitted snapshot, retained latest JSON, same-promise joining for debounce and navigation, empty-draft handling and a visible failure outcome. Keep nontext rich data valid and stop an ambiguous request from starting a fresh POST. Test against real writes in the Garden suite. (C2, C3)

- [ ] T014 [US1] Compose `src/features/notes/note-editor.tsx`, `note-list.tsx` and `src/features/folders/folder-list.tsx`. Preload one editor chunk from the list, synchronously use the warmed module on Compose, focus the editor and display pending/saving/saved/error. Build keyboard-accessible New folder dialog and error retention, default/all destinations, selected/empty list and page controls. Decouple focus and local draft creation from server I/O. (C1, C2, C3, C4)

- [ ] T015 [US1] Create the pathless `src/routes/_authenticated/_library.tsx` layout and its `_library.folders.index.tsx`, `_library.folders.$folderId.tsx` and `_library.notes.$noteId.tsx` children. Wire them to `src/features/notes/workspace.tsx`; use the shared shell to keep draft identity and caret across route/viewport changes. Join the save pump before any in-app leave. Handle Back, direct load, unavailable note and preserved page/scroll/focus. Run the Vite route generator to produce `src/route-tree.gen.ts` for these files before type-checking. Redirect authenticated `/` and `/dashboard` to `/folders/all`. (C2, C3, C5)

## 4 · US7 (P3) navigate the responsive workspace

Goal: keep the capture surface usable across the three widths. Independent proof: with an existing populated account, traverse Folders, page two, a known note, Back and Account by keyboard. Resize with pending text, inspect the visible panes and verify zero horizontal overflow.

- [ ] T016 [US7] In `src/features/notes/workspace.tsx` and `src/features/folders/folder-list.tsx`, implement 390px one-region and 810/1440px three-region layouts per contract. Reuse SidebarProvider and NavUser with labeled Account link at the foot of Folders, preserve theme/admin/sign-out behavior and existing account route. Honor keyboard focus, safe areas and min-width/overflow in each pane. Cover all widths and both themes in the Garden suite. (C5)

## 5 · Complete the cutover and verify

Complete all current callers in the same integration branch. A static reference in an applied migration, archived design or historic measurement is expected. A live fetch or executable fixture targeting the dropped collection is a defect.

- [ ] T017 Remove the five `src/routes/_authenticated/entries*.tsx` routes and `src/components/app-sidebar.tsx`. Build with the TanStack Vite plugin to regenerate `src/route-tree.gen.ts` after new and obsolete routes settle. Confirm `/`, `/dashboard`, folder, note and account direct URLs in the built app. (C6)

- [ ] T018 [P] After extracting needed helpers and mounting the replacement, delete all six files in `src/features/entries/` and both in `src/features/tasks/`. Keep private token reads callable via the new module. Remove legacy-only CSS rules from `src/styles/globals.css` where unused. Check the build and knip for callers. (C6)

- [ ] T019 [P] Replace the smoke journey in `tests/e2e/smoke.spec.cjs`. Retarget auth, theme and capability checks to the new landing and menu. Remove `notebook.spec.cjs`, `tasks.spec.cjs`, `attachments.spec.cjs` only once replacement capture, privacy and attachment API coverage exists. Preserve each remaining auth assertion. (C2, C5, C6)

- [ ] T020 [P] Retarget `deploy/railway/verify-{app,restore,signup}.ts` and `scripts/test-{deployment-accounts,restore}.ts` to folders, notes and autosave. Preserve attachment proof through the owner API, full source/restore record and byte comparisons, fault-injected failure cleanup and anonymous/cross-owner denials. Exercise local disposable fixtures using the contained targets. Leave real Railway execution to an owner-authorized deployment. (C6)

- [ ] T021 [P] Adapt `tests/load/k6/script.js` to folder/list/detail, stable create, revision update and private files. Keep existing environment knobs compatible; identify historical entry workload results in `docs/testing/load-testing.md`. Port `tests/performance/editor.spec.cjs` to note routes and saved rich-document fixtures. Keep cold perf baselines distinct from SC-001. Validate client operations with a small contained run, without running a capacity campaign. (C6)

- [ ] T022 [P] Adapt `tests/screenshots/capture.cjs` and `scripts/capture-screenshots.sh` together to folders/list/editor and the new seed data. Preserve valid image/video output names used downstream, update the phone composite inputs, and stop capturing deferred task/focus screens. Keep R2 evidence in test artifacts, not committed binary replacements. (C5, C6)

- [ ] T023 Extend `scripts/run-contained.sh`, `deploy/local/prepare-test.sh` and `deploy/local/docker-compose-test.yml` at the missing execution points described below. Include selected operator/seed/restore inputs, the performance and screenshot clients, and successful visual evidence. Keep the production load/restore workload separate from a short smoke of the changed callers. Preserve the security envelope and both default suites. (C1, C4, C5, C6)

- [x] ~~T024~~ Cut by owner decision (2026-11-18): CI keeps its host-runner jobs on disposable GitHub runners; the contained targets are for local runs.

- [ ] T025 [P] Update `docs/features/notes.md`, `docs/features/{tasks,attachments}.md`, `docs/design/{notes-journal,prebuilt-ui}.md`, `docs/architecture/spec.md`, `README.md`, `AGENTS.md` and `CHANGELOG.md` to describe the active notebook and mark historical UI/screenshots and superseded design. Explain how to retrieve code from the pre-R2 SHA, and distinguish later features from what ships. (C2, C5, C6)

- [ ] T026 [P] Align `docs/testing/verification.md`, `docs/ci/checks-and-rules.md`, `docs/development/{setup,root-files}.md`, `deploy/{OPERATIONS,RAILWAY}.md` and `.agents/context/{build,docs}.md` with actual paths, quality/contained gates and recovery. Update changed root-file entries. Check docs links and topic budgets. (C6)

- [ ] T027 Run every gate in `specs/002-notes-redesign/r2-compose/quickstart.md` on the integrated branch and review the light/dark screenshots against Round 1. Check active code, generated routes/types, scripts and docs for retired callers. Resolve any gaps before ticking `tasks.md`. Record exits, negative controls, both SC-001 series, payload evidence, preserved/retired checks, the pre-R2 SHA and unexecuted real-deployment checks in the R2 implementation PR. (C1, C2, C3, C4, C5, C6)

## Dependencies and parallel work

1. T001–T004 establish independent red evidence. T005 follows T001; T006 follows T004. Run T007 after T005, followed by T008 and T009. T010 follows the migrated schema and seed. Gate UI implementation on verified backend and generated types. Capture pre-cutover measurements and the recovery SHA before deleting their sources.
2. US1 can split T011 (records) and T012 (editor). T013 consumes T011. T014 integrates both plus T013. US1 T015 integrates T014 with the shell and exposes the capture journey through real routes. After T015, T016 can run alongside the test and operator ports on disjoint files. The first independently reviewable product slice ends at T016 once the Garden journey passes on the integrated worktree. Release waits for the cutover.
3. T017 follows T015 and the new links. T018 follows T012–T017. T019–T022 may run in parallel after replacement contracts settle, using disjoint files. Sequence T023 after T001/T010 and the caller ports, then switch CI in T024. Preserve T025 and T026 as separate documentation slices. Run the live proofs specified in T020–T022 after T023 supplies their contained profiles. Authoring those caller ports does not depend on T023. T027 closes only against the fully integrated tree.
4. The runner extensions in T023 are needed where the stock runner lacks inputs or processes. Keep default API/browser runs, then invoke isolated profiles through the same two Make targets for the former CI drills. Supply the pinned local PB binary and the dedicated run-owned database to the local bootstrap/explicit-reset drill. The seed currently assumes host Docker for CLI fallback. In `scripts/seed.ts` support invoking the colocated pinned PB CLI only inside the isolated service with its verified loopback endpoint, matching data directory and encryption environment. Preserve current host guards and require authentication read-back. Exercise the seed CLI's real success and refusal paths and verify credentials afterward. Run the restore binary against the extracted fixture archive in its own clean data directory, on a second internal loopback port under the same network namespace. Use the identical encryption key, disable outbound mail and cron, and run the existing record/file comparator. Run the local operator app/proxy tests in a browser-equipped helper with Bun, and the enabled-registration test against a build AND server configured for signup. Do not skip disabled-registration coverage. Time/cap/clean every profile like the default run.
5. Preserve proof boundaries. Use a short containerized client smoke for changed workload scripts (not the prior capacity baseline), and copy review images from the contained browser run. No public deployment runs. If an existing drill cannot run within the envelope, report the exact failed check before R2 acceptance.
