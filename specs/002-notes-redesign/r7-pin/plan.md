# Implementation Plan: R7 · Pin

**Branch**: `r7-pin` | **Base**: `b895d10` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md) | **Issue**: [#42](https://github.com/hsb3/pocketbase-notes-app/issues/42)

**Input**: Feature specification from `specs/002-notes-redesign/r7-pin/spec.md`

## Summary

Each note gets a `pinned` bool that is written by only one path: a new `pin` verb on the existing R5 note-action route. The route keeps R5's owner, raw-date and transaction guards. Under amended constitution III (2.0.0), pin is metadata-only: it neither checks nor advances the content revision, and its raw-SQL update leaves the last-edited time alone. A pin on one device therefore never makes a save on another device fail. This design follows the [sync evaluation](../../../docs/architecture/evaluations/sync-and-presence/report.md).

- **Lists:** folder lists and All Notes sort pinned rows first. A new Pinned pseudo-folder filters on `pinned = true`.
- **Client:** Pin / Unpin is one request that sets an absolute value, with a safe Retry. It does not use R5's command pipeline and does not touch the draft.
- **Other actions:** move, delete, restore and purge need no change. They already leave the column alone.

Decisions and rejected options: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (React 19, TanStack Router), PocketBase 0.40.1 JSVM hooks (Goja)

**Primary Dependencies**: Existing only: `pocketbase` SDK ^0.28, shadcn primitives, `lucide-react` (`Pin` icon)

**Storage**: SQLite through PocketBase. One new bool field and one partial index ([data model](data-model.md))

**Testing**: Bun API scripts (`scripts/test-*.ts`) and Playwright (`tests/e2e/*.spec.cjs`, Chromium and WebKit), both run through `make test-*-contained`

**Target Platform**: Responsive web, 390 / 810 / 1440 CSS px

**Project Type**: Web app with an embedded backend, shipped as a single image

**Performance Goals**: SC-002: lists reflect a pin within 1 s on a healthy connection

**Constraints**: A pin must never bump `updated` or `revision`, touch content columns, or cause a 409 on any device. No new dependencies.

**Scale/Scope**: Personal library (hundreds of notes). About 12 files change.

## Constitution Check

| Gate | Result (intake and post-design) |
|---|---|
| I. Backend before frontend | Pass. W1 migration and codegen, then W2 hook and API tests, then W3 UI. |
| II. Locked by default | Pass. `pinned` is writable only through the owner-checked action route. Create and update rules block it on the ordinary API. Denied cases (B, guest, forged create or PATCH) are tested. |
| III. Never lose words (2.0.0) | Pass. Pin is a metadata-only write: no content column changes, no revision change, and last change wins on its own field. Content saves keep the revision check unchanged. The cross-device test proves a pin causes no 409. |
| IV. Smallest change | Pass. Reuses the action route guards, pseudo-folder routing and row layout. No new route file, dependency or abstraction. |
| V. Verified for real | Pass. Contained API and browser suites at three widths, both engines and both themes. |

No violations, so the Complexity Tracking section is omitted.

## Project Structure

### Documentation (this feature)

```text
specs/002-notes-redesign/r7-pin/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/pin.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code

| Wave | Files (create or modify) | Result |
|---|---|---|
| W1 · schema | Create `pb/migrations/1795000500_note_pins.js`. Regenerate `src/services/pocketbase-types.ts` (`make codegen`). Modify `scripts/test-r2-upgrade.sh`. | Field, index and rules. Up, down and up again are byte-equal. [W1 exit](quickstart.md#w1-exit) |
| W2 · API | Modify `pb/hooks/note-actions.pb.js`. Create `scripts/test-pins.ts`. Modify `scripts/test-notes.ts` (to call it). | `pin` verb, `pinned` in every action projection, denial and survival tests. [W2 exit](quickstart.md#w2-exit) |
| W3 · UI | Modify `src/features/notes/{data.ts,actions.ts,note-actions.tsx,note-list.tsx,workspace.tsx}` and `src/features/folders/folder-list.tsx`. Create `tests/e2e/pin.spec.cjs`. | Pin menu item, pinned group and marker, Pinned view, compose from Pinned. [W3 exit](quickstart.md#w3-exit) |
| W4 · docs | Modify `docs/features/{notes,folders}.md`, `CHANGELOG.md`, `specs/002-notes-redesign/versions.md`. | Docs match the behaviour; R7 marked `done`. |

**Structure Decision**: Use the existing layout. Pin belongs to the `notes` feature, so it needs no new `src/features/` folder. The Pinned view is a pseudo-folder like `all` and `recently-deleted`.

## Verification Plan *(mandatory)*

| Requirement or scenario | Check that proves it (file or command) | Kind |
|---|---|---|
| FR-001 pin state, default off, owner-only | `scripts/test-pins.ts` (create default, B and guest reads); `make codegen` diff | API |
| FR-002 Pin / Unpin in note actions, keyboard | `tests/e2e/pin.spec.cjs` (menu, keyboard, focus return) | browser |
| FR-003 pinned group first, recency within groups, marker | `scripts/test-pins.ts` (list order); `tests/e2e/pin.spec.cjs` (marker, order) | API, browser |
| FR-004 Pinned view: once each, folder name, empty state | `scripts/test-pins.ts`; `tests/e2e/pin.spec.cjs` | API, browser |
| FR-005 pin does not change `updated`, content or folder | `scripts/test-pins.ts` (before/after row compare) | API |
| FR-006 independent of content version; last change wins; idempotent | `scripts/test-pins.ts` (pin then body save with pre-pin revision: both 200; revision unchanged by pin; two clients in sequence; same-value no-op) | API |
| FR-007 survives move, delete, folder delete, restore; deleted absent | `scripts/test-pins.ts`; `tests/e2e/pin.spec.cjs` step 5 | API, browser |
| FR-008 compose from Pinned files in Notes, unpinned | `tests/e2e/pin.spec.cjs` step 4; create-rule test in `scripts/test-pins.ts` | browser, API |
| FR-009 server-enforced owner-only | `scripts/test-pins.ts` (B 404, guest 401, forged create and PATCH refused) | API |
| Story 1.1–1.3 ordering | `scripts/test-pins.ts` list order | API |
| Story 1.4 other device sees same state | `scripts/test-pins.ts` (second SDK client of A reads the same order) | API |
| Story 1.5, SC-001 keyboard, 3 widths, no horizontal scroll | `tests/e2e/pin.spec.cjs` | browser |
| Story 2.1–2.4 | `tests/e2e/pin.spec.cjs` steps 3–4 | browser |
| Story 3.1–3.3 | `scripts/test-pins.ts` survival; `tests/e2e/pin.spec.cjs` step 5 | API, browser |
| Edge: pin is not an edit | FR-005 row | API |
| Edge: concurrent change and lost reply | FR-006 row; `tests/e2e/pin.spec.cjs` (second context keeps saving after a pin; reply aborted after commit, then Retry leaves the note pinned once) | API, browser |
| Edge: open note keeps draft, next autosave succeeds | `tests/e2e/pin.spec.cjs` step 2 | browser |
| Edge: another writer | FR-009 row | API |
| Edge: all notes pinned → one group | `scripts/test-pins.ts` | API |
| Edge: search ignores pins | `scripts/test-pins.ts` (search order unchanged) | API |
| SC-002 reflected within 1 s | `tests/e2e/pin.spec.cjs` (assertion timeout 1 s after the acknowledgement) | browser |
| SC-003 once in Pinned when active, never when deleted | FR-007 rows | API, browser |
| SC-004 no overwritten edits, no pin-caused refusals, no flipped pins | FR-006 and lost-reply rows | API, browser |
| SC-005 another account sees zero pins | FR-009 row | API |
| Migration rollback | `scripts/test-r2-upgrade.sh` (up, down, up) | API |

Gaps: none known. No physical-device check is needed, because R7 adds no keyboard or viewport behaviour beyond what R6 already verified.

## New Dependencies *(mandatory)*

None. The `Pin` icon comes from `lucide-react`, which is already installed.
