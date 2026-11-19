# R4 implementation plan · Search across folders

**Branch** `r4-search` · **Base** `af3006a` · **2026-11-19** · [Scope and acceptance](spec.md) · [Search titles and body text across folders, issue 39](https://github.com/hsb3/pocketbase-notes-app/issues/39)

## Deliverable

From any folder, search the title and visible body text of every active owned note, open a result, and go Back to its query and position. Prove a unique body-only hit with a highlighted snippet in under two seconds on at least 19 of 20 trials in **each** of six combinations of Chromium and WebKit at 390, 810 and 1440 CSS px. A second account and an anonymous client must receive zero results for the owner’s unique term. [Live validation and evidence](quickstart.md)

## Technical decisions

1. **Make the displayed title searchable.** The stored comparison field is `search_key`. The [R1 note-data foundation](../r1-data-foundation/contracts/records.md) folds visible document text with NFC → locale-independent uppercase → NFC and includes the fallback title for a blank first line. A displayed title cut at 160 code points can fold differently from the full line. On saves, prefix the separately folded title and LF only when the R3 key lacks that title. Then replace each embedded NUL with LF in the key so a word after NUL remains searchable. One new migration compares the complete R3 and R4 keys, repairs affected rows and adds the index. Down restores the exact R3 fold of each current note, including notes created or edited under R4. It preserves every note's content, revision and dates. Bind the literal substring against this key through `pb.filter()` and share the ordinary active predicate and owner rule. [Repair and rollback](data-model.md#upgrade-and-rollback) · [Scope exclusions](spec.md) · [Design trade-offs](research.md)
2. **Page and highlight the matches.** The index on `user, updated DESC, id DESC, deleted` scans one owner in page order. Active status is a residual filter. The substring scan and exact count can visit all that owner’s notes, including deleted candidates. Return 20 rows per page. For each authorized row, derive `snippet: {before, match, after}` from the matching original source. Locate the original characters that contributed the first and last folded match positions, even when a group folds correctly as a whole. Replacing each NUL with one LF preserves those positions. Clip around those contributors, to 226 code points including ellipses. Render only the middle string in a semantic mark. Reuse folder names already fetched. [Snippet mapping](data-model.md#snippet-mapping) · [Wire contract](contracts/search.md#records-list)
3. **Preserve the list and draft on navigation.** Extend [R2's list position](../r2-compose/contracts/compose.md) with submitted query and result page alongside folder, ordinary page, scroll, row focus and list origin. The folder URL stores query and both pages; note history retains the position. In the wide detail pane, paging, submitting and clearing PUSH a folder entry through [R3 save recovery's leave guard](../r3-resilience/contracts/editor.md#leave-and-sign-out). Keep editing restores the submitted search field and result page, and returns focus to the editor. After acceptance, browser Back restores the note with its previous side list. Reuse the existing shadcn controls and 768 px breakpoint. [Navigation and focus](contracts/search.md#navigation-and-focus)
4. **Measure from the writer’s action.** Six independent timing cells each exercise 20 different body terms against a real 100-note library. Measure from the completed input event until the correct row and highlighted context are visible. Preserve all 120 durations. Functional coverage also checks Back, dirty drafts, keyboard, both themes and privacy. [Measurement protocol](quickstart.md#sc-004-timing)

The stack is React 19, TanStack Router, TypeScript, Bun, the singleton PocketBase SDK and server with SQLite and JS hooks. Existing ProseKit saves and revision transactions supply the source data. R4 adds no packages or services. [SDK 0.28.2 lock](../../../bun.lock) · [Server 0.40.1 pin](../../../deploy/docker/Dockerfile)

## Constitution check

| Gate | Intake and post-design check |
|---|---|
| Backend before frontend | Add the reversible key repair, index and list projection to the existing collection first. Verify fresh install, existing data and contained codegen before connecting the UI. |
| Privacy | Use the standard rule-scoped records list, server-owned comparison field, response projection and client session checks. Require real A/B/anonymous denials and a deleted-state control. |
| Preserve writing | Search only reads notes. All changes away from an active document pass through R3’s editor guard and retain its revision and recovery contract. |
| Smallest complete change | Reuse the existing hooks, fields, routes, list, paging and UI primitives. The route path topology stays the same. Generated files can only come from their project generators. |
| Live evidence | The API, browser and timing checks run inside the existing isolated runner. Require actual durations, both viewport layouts and preserved ordinary list/editor behavior. Runtime gates belong to implementation. |

## Delivery order

W1 delivers the API without changing ordinary list behavior. W2 consumes it through the signed-in workspace and adds measured timing. W3 records release evidence. Each functional wave starts with its regression tests against the preceding behavior, then goes green before handoff. Independent proof and parallelizable work are in [tasks.md](tasks.md). Run Spec Kit with `SPECIFY_FEATURE_DIRECTORY=specs/002-notes-redesign/r4-search` and `SPECIFY_FEATURE_NO_PERSIST=1` to preserve the root feature pointer.

## Wave slicing input

Each row is the task's exclusive write allowlist. **Create** and **Modify** refer to repository-relative files. **Generator-only** permits output from the named generator. Numbers are estimates of whole post-edit files in decimal kB rounded up, including the generated file even if byte-identical. Measure actual whole-file sizes before handoff. Each wave must fit 10 files and 100 kB.

| Wave / task | Owned files (estimated kB) | Handoff |
|---|---|---|
| [W1 exit](quickstart.md#w1-exit) · T001 | Modify `scripts/test-notes.ts` (45), Modify `scripts/test-r2-upgrade.sh` (22) | Record fresh title/post-NUL misses and staged key/index failures on R3. Cover the traced owner query, post-save rollback, replay and atomic failure |
| W1 T002 | Create `pb/migrations/1795000300_repair_active_note_search.js` (6), Generator-only `src/services/pocketbase-types.ts` (7) | Migration alone plus fresh double generation, tracked-byte comparison and hash |
| W1 T003 | Create `pb/hooks/note-search.js` (11), Modify `pb/hooks/notes.pb.js` (7) | Derive title- and NUL-safe keys, map marked rows to originals and close the integrated API and migration gates |
| [W2 exit](quickstart.md#w2-exit) · T004 | Create `tests/e2e/search.spec.cjs` (18) | Record pre-UI failures for list, return and wide-detail guard |
| W2 T005 | Create `tests/e2e/search-timing.spec.cjs` (8), Create `scripts/check-sc004.py` (5), Modify `scripts/run-contained.sh` (12) | Search profile, red timing tests and report checker |
| W2 T006 | Modify `src/features/notes/data.ts` (8), Modify `src/routes/_authenticated/_library.folders.$folderId.tsx` (2) | Validated list state and typed search projection |
| W2 T007 | Modify `src/features/notes/note-list.tsx` (12), Modify `src/features/notes/workspace.tsx` (20) | Integrate T006 with the existing guard and close browser/timing gates |
| [W3 exit](quickstart.md#w3-exit) · T008 | Modify `docs/features/notes.md` (11), Modify `docs/testing/verification.md` (20), Modify `CHANGELOG.md` (9) | Document delivered behavior and measured acceptance |
| W3 T009 | Modify `specs/002-notes-redesign/r4-search/tasks.md` (14) | Last writer records integrated proof |

**Totals** W1 6 files / 98 kB, W2 8 files / 85 kB, W3 4 files / 54 kB. T001 hands red evidence to T002/T003. Their integrated green gate fixes the API shape before W2. T004/T005 establish the browser baseline on W1. T006 supplies the route/data contract to T007, the sole writer of the list and guard integration. T008/T009 follow W2 acceptance. Shared read dependencies include R1's comparison helper and rules, R2's ordinary excerpt and R3's draft/leave logic. TanStack regenerates the existing route tree at build. Check that it stays byte-identical.
