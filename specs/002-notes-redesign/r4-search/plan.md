# R4 implementation plan · Search across folders

**Branch** `r4-search` · **Base** `af3006a` · **2026-11-19** · [Scope and acceptance](spec.md) · [Search titles and body text across folders, issue 39](https://github.com/hsb3/pocketbase-notes-app/issues/39)

## Deliverable

From any folder, search the visible writing in every active owned note, open a result, and go Back to its query and position. Prove a unique body-only hit with a highlighted snippet in under two seconds on at least 19 of 20 trials in **each** of six Chromium/WebKit width combinations. A second account and an anonymous client must receive zero results for the owner’s unique term. [Live validation and evidence](quickstart.md)

## Technical decisions

1. **Reuse the derived Unicode key.** The intended predicate is an OR over title and visible body. R1 stores their searchable union in `search_key`, including the fallback title. Raw LIKE fails the non-ASCII control. Bind a literal contains pattern against the existing folded key through `pb.filter()` and share the active predicate with the ordinary list. R1’s server owner rule applies to both. The only migration adds the index. [Alternatives and baseline](research.md)
2. **Bound storage reads and outbound rows separately.** Add the composite index on owner, deletion date, update time and ID. Return 20 results per page with stable descending date/ID order. Derive and project a bounded snippet from the original text for that page only. Keep the response-only field in a local summary type and render text around a semantic mark. Reuse folder names already fetched by the workspace. [Data and index](data-model.md) · [Wire contract](contracts/search.md#records-list)
3. **Keep search in the existing list.** A single submitted form works at all widths. Keep its origin in the folder URL, including ordinary and search pagination. Detail history state carries the return position. R3 resolves dirty-draft departure before any result change. Use the current shadcn controls, semantic colors and 768 px layout breakpoint. [Navigation and focus](contracts/search.md#navigation-and-focus)
4. **Measure from the writer’s action.** Six independent timing cells each exercise 20 different body terms against a real 100-note library. Measure from the completed input event until the correct row and highlighted context are visible. Preserve all 120 durations. Functional coverage also checks Back, dirty drafts, keyboard, both themes and privacy. [Measurement protocol](quickstart.md#sc-004-timing)

The stack is React 19, TanStack Router, TypeScript, Bun, the singleton PocketBase SDK 0.28.2 and server 0.40.1 with SQLite and JS hooks. Existing ProseKit saves and revision transactions supply the source data. There are no new packages or services.

## Constitution check

| Gate | Intake and post-design check |
|---|---|
| Backend before frontend | Add the reversible index and list projection to the existing collection first. Verify fresh install, existing data and contained codegen before connecting the UI. |
| Privacy | Use the standard rule-scoped records list, server-owned comparison field, response projection and client session checks. Require real A/B/anonymous denials and a deleted-state control. |
| Preserve writing | Search issues only reads. All changes away from an active document pass through R3’s editor guard and retain its revision and recovery contract. |
| Smallest complete change | Reuse the existing hooks, fields, routes, list, paging and UI primitives. The route path topology stays the same. Generated files can only come from their project generators. |
| Live evidence | The API, browser and timing checks run inside the existing isolated runner. Require actual durations, both viewport layouts and preserved ordinary list/editor behavior. Runtime gates belong to implementation. |

## Delivery order

W1 delivers the API without changing ordinary list behavior. W2 consumes it through the signed-in workspace and adds measured timing. W3 records release evidence. Each functional wave starts with its regression tests against the preceding behavior, then goes green before handoff. Independent proof and parallelizable work are in [tasks.md](tasks.md). Run Spec Kit with `SPECIFY_FEATURE_DIRECTORY=specs/002-notes-redesign/r4-search` and `SPECIFY_FEATURE_NO_PERSIST=1` to preserve the root feature pointer.

## Wave slicing input

Each row is a task’s exclusive write allowlist. Paths are repository-relative. Estimates are full post-edit decimal kB, rounded up, including generated outputs if changed. Verification commands may create ignored build/test artifacts. Recount actual whole files before handoff. Limit every wave to 10 unique files and 100 kB; split a growing wave at the named task boundaries before it passes either limit. Each product handoff requires a build and its focused live gates.

| Wave / task | Owned files (kB) | Handoff |
|---|---|---|
| W1 T001 | `scripts/test-notes.ts` (38), `scripts/test-r2-upgrade.sh` (10) | Independent red API and upgrade assertions first |
| W1 T002 | `pb/migrations/1795000300_index_active_note_search.js` (2), `src/services/pocketbase-types.ts` (7, codegen only) | Fresh/upgrade index and generated schema before W2 |
| W1 T003 | `pb/hooks/note-search.js` (7), `pb/hooks/notes.pb.js` (7) | Consume R1 comparison helper; API and upgrade green |
| W2 T004 | `tests/e2e/search.spec.cjs` (14) | Red normal-entry and guard scenarios |
| W2 T005 | `tests/e2e/search-timing.spec.cjs` (8), `scripts/check-sc004.py` (5), `scripts/run-contained.sh` (12) | Red timing and negative report control before UI |
| W2 T006 | `src/features/notes/data.ts` (8), `src/routes/_authenticated/_library.folders.$folderId.tsx` (2) | Validated list state and typed search projection |
| W2 T007 | `src/features/notes/note-list.tsx` (12), `src/features/notes/workspace.tsx` (20) | Integrate T006, close functional and timing gates |
| W3 T008 | `docs/features/notes.md` (11), `docs/testing/verification.md` (20), `CHANGELOG.md` (9) | Update after measured acceptance |
| W3 T009 | `specs/002-notes-redesign/r4-search/tasks.md` (10) | Last writer records integrated proof |

**Totals** W1 6 files / 71 kB, W2 8 files / 81 kB, W3 4 files / 50 kB. The backend hook owns the snippet response shape before the client consumes it. The route validator and data service precede list/workspace integration. The two UI files share the list-position contract and have a single writer. No file has concurrent writers. Do not edit `src/route-tree.gen.ts`: the existing route filenames and hierarchy are unchanged. Run the normal build and verify the generator produces no topology diff. R3’s guard, helpers, rule definitions, original comparison-key helper and ordinary excerpt consumers are read dependencies. Only the named workspace integration point changes guard routing.
