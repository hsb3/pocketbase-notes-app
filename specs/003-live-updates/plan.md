# Implementation Plan: Live updates on open notes and lists

**Branch**: `live-updates` | **Base**: `fe0b749` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md) | **Issue**: [#68](https://github.com/hsb3/pocketbase-notes-app/issues/68)

**Input**: Feature specification from `specs/003-live-updates/spec.md`

## Summary

Every committed write to a note sends a small **change notice** on one PocketBase realtime topic, `notebook-changes`, and only to the note's owner. That covers creates and content saves (after-success record hooks) and the raw-SQL move, delete, restore, pin and folder-delete paths (sent explicitly after their transactions). The notice carries state markers (ID, folder, deleted, revision, pin) and no writing. The client treats it as a hint and reads through the existing owner-checked readers.

- **Open note:** a notice for the open note is dropped if it is this device's own echo. Otherwise the client waits until no save, action or dialog is in progress, pauses autosave, reads the note and applies one decision table. A clean draft takes the new version. A metadata-only change (a move elsewhere) is adopted even with unsaved edits. Different words with unsaved edits open R3's conflict dialog. A delete shows the existing unavailable paths.
- **Lists:** the visible list and Recently Deleted re-read at most once per 250 ms merge window, without clearing the rows shown or moving focus.
- **Catch-up:** focus and every reconnect re-read the list, folders and open note, because notices are not replayed and connections end within 30 minutes.

Decisions and rejected options: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (React 19, TanStack Router), PocketBase 0.40.1 JSVM hooks (Goja)

**Primary Dependencies**: Existing only: `pocketbase` SDK ^0.28 (`pb.realtime`), the server's built-in realtime broker

**Storage**: No change. Notices are never stored ([data model](data-model.md))

**Testing**: Bun API scripts (`scripts/test-*.ts`, raw SSE over `fetch` because Bun has no `EventSource`) and Playwright (`tests/e2e/*.spec.cjs`, Chromium and WebKit, two browser contexts), both through `make test-*-contained`

**Target Platform**: Responsive web, 390 / 810 / 1440 CSS px

**Project Type**: Web app with an embedded backend, shipped as a single image

**Performance Goals**: SC-001 and SC-004: a change shows on the second device within 2 s, in at least 19 of 20 runs

**Constraints**: No notice to another account or a guest. No notice for a refused or rolled-back write. No content in a notice. No client write caused by a notice. No change to the revision rules (constitution III 2.0.0). No new dependencies.

**Scale/Scope**: Personal library, one writer on a few devices. About 20 files change, 6 of them docs.

## Constitution Check

| Gate | Result (intake and post-design) |
|---|---|
| I. Backend before frontend | Pass. W1 lands the hooks and API tests before any client wave. There is no schema change, so no migration or codegen. |
| II. Locked by default | Pass. The server sends notices only to the owner's own authenticated clients, and the check is in one helper. Denied cases are tested: B, guest, B's record subscription, and a token switch on one client. Notices carry no forgeable or private content. |
| III. Never lose words (2.0.0) | Pass. Content saves keep the revision check. The client never writes because of a notice. Automatic replacement happens only for a clean draft. Adopting a metadata-only change, including the `reconcile()` replay, happens only when the server's words equal the draft's baseline, and the next write still goes through the 409 check. Pin stays metadata-only. |
| IV. Smallest change | Pass. One server helper, one client module, and reuse of `replaceSaved`, `changedElsewhere`, `adoptMove`, `missing()` and the quiet trash `load()`. No new route, collection, dependency or UI element. |
| V. Verified for real | Pass. Contained API suite over real SSE, plus a two-context browser suite at three widths on both engines, including fallback with realtime blocked. |

No violations, so the Complexity Tracking section is omitted.

## Project Structure

### Documentation (this feature)

```text
specs/003-live-updates/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/notice.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code

| Wave | Files (create or modify) | Result |
|---|---|---|
| W1 · server notices | Create `pb/hooks/note-notice.js`, `scripts/test-live-updates.ts`. Modify `pb/hooks/notes.pb.js`, `pb/hooks/note-actions.pb.js`, `pb/hooks/folders.pb.js`, `scripts/test-notes.ts`. | Owner-only notices after every committed note write. [W1 exit](quickstart.md#w1-exit) |
| W2 · open note | Create `src/features/notes/live.ts`, `tests/e2e/live-updates.spec.cjs`. Modify `src/features/notes/draft.ts`, `src/features/notes/data.ts` (export `equalJSON`), `src/features/notes/workspace.tsx`, `scripts/run-contained.sh` (profile `live`). | Subscription, echo filter, busy deferral, `remote()` decision table, metadata-tolerant `reconcile()`. [W2 exit](quickstart.md#w2-exit) |
| W3 · lists | Modify `src/features/notes/note-list.tsx`, `src/features/notes/recently-deleted.tsx`, `src/features/notes/workspace.tsx`. | Debounced live re-reads that keep rows, scroll and focus. [W3 exit](quickstart.md#w3-exit) |
| W4 · catch-up and fallback | Modify `src/features/notes/live.ts`, `src/features/notes/workspace.tsx`, and existing specs that need a stale second context (`tests/e2e/save-resilience.spec.cjs` and any other that the W4 run shows). | Focus, reconnect and first-connect retry; account switch; the R3 fallback with realtime blocked. [W4 exit](quickstart.md#w4-exit) |
| W5 · docs and gate | Modify `docs/features/notes.md`, `docs/features/folders.md`, `docs/testing/verification.md`, `CHANGELOG.md`, `specs/002-notes-redesign/versions.md`. | Docs match the behaviour; LU marked `done`. [W5 exit](quickstart.md#w5-exit) |

**Structure Decision**: Use the existing layout. Live updates belong to the `notes` feature (`src/features/notes/live.ts`), so no new `src/features/` folder. The server helper follows the `note-lifecycle.js` module pattern and is loaded with `require(`${__hooks}/note-notice.js`)` inside each handler, because Goja compiles each callback in isolation.

## Verification Plan *(mandatory)*

| Requirement or scenario | Check that proves it (file or command) | Kind |
|---|---|---|
| FR-001 open note learns of every write kind | `scripts/test-live-updates.ts` (one notice per create, save, move, pin, unpin, delete, restore, folder delete); `tests/e2e/live-updates.spec.cjs` W2 1, 3, 5, 6 | API, browser |
| FR-002 clean draft takes the newer version; next save succeeds | live spec W2 1 | browser |
| FR-003 dirty draft with different words → conflict at once, words kept | live spec W2 2 | browser |
| FR-004 metadata-only change adopted, dirty or clean | live spec W2 3, 4 (held PATCH, 409, replay) | browser |
| FR-005 announcement, focus kept; delete → unavailable paths | live spec W2 1, 6 | browser |
| FR-006 own saves and actions are not remote changes | live spec W2 7 (zero extra note reads); W2 1 (no self-conflict) | browser |
| FR-007 no apply while busy; re-check afterwards | live spec W2 2, 4 (held PATCH); unit-level ordering covered by the same runs | browser |
| FR-008 lists reflect every write kind | live spec W3 1, 2 | browser |
| FR-009 rows kept, page, scroll, focus, search text kept; burst coalesced | live spec W3 3, 4 | browser |
| FR-010 raw-SQL actions and folder delete send notices; purge does not need to | `scripts/test-live-updates.ts` | API |
| FR-011 owner only, server-enforced | `scripts/test-live-updates.ts` (B, guest, B's `notes/*`, token switch 403) | API |
| FR-012 re-read on visible and on reconnect | live spec W4 1, 2 | browser |
| FR-013 account change stops the earlier account's updates | live spec W4 4; server side by the 403 row | browser, API |
| FR-014 realtime down → everything works as before; retry on visible or online | live spec W4 3; R3 `save-resilience.spec.cjs` with realtime blocked | browser |
| FR-015 notices carry no content | `scripts/test-live-updates.ts` (exact keys) | API |
| Story 1.1–1.5 | live spec W2 1, 2; R3 suite for 1.5 | browser |
| Story 2.1–2.4 | live spec W3 1–3 | browser |
| Story 3.1–3.5 | live spec W2 3–6 | browser |
| Story 4.1–4.3 | live spec W4 1–3 | browser |
| Edge: privacy | FR-011 row | API |
| Edge: sign-out and account switch | FR-013 row | browser, API |
| Edge: own changes | FR-006 row | browser |
| Edge: pending actions and choices | FR-007 row; live spec W2 with a move pending in A1 while A2 saves | browser |
| Edge: burst | live spec W3 4 | browser |
| Edge: remote change while choosing | live spec W2 2 extended: second A2 save while the dialog is open; **Reload saved** loads the newest | browser |
| Edge: unavailable then restored elsewhere | live spec W2 6 extended: A2 restores; A1 stays unavailable, list shows the note | browser |
| Edge: expired session | live spec W4 4 (no reads after expiry); existing R3 expiry tests stay green (W4 6) | browser |
| Edge: many tabs | the two contexts in every live spec row are equivalent to two tabs | browser |
| SC-001 within 2 s, 19 of 20 | live spec W4 5 (timings in the `live` profile report) | browser |
| SC-002 zero false conflicts, zero lost words | live spec W2 1–6 | browser |
| SC-003 zero notices to B and guest | FR-011 row | API |
| SC-004 catch-up within 2 s | live spec W4 1, 2 | browser |
| SC-005 focus, scroll, search text kept at 3 widths | live spec W3 3 at 390, 810, 1440 | browser |

Gaps: a deployed instance (Railway edge passing SSE unbuffered) is not checked here. It needs the owner's deployment action. Physical-phone behaviour when the OS suspends a tab is covered only by the `visibilitychange` catch-up, which the browser test triggers by hand.

## New Dependencies *(mandatory)*

None. The client uses the installed `pocketbase` SDK's `pb.realtime`. The API test reads SSE with Bun's built-in `fetch`.
