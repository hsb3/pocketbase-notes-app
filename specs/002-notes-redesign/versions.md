# Release increments: 002-notes-redesign

Breaks [spec.md](spec.md) into increments that build up to the full spec. Owner's
direction: the first major milestone is a stable, bug-free version with all basic
features; later features start only after it is proven stable.

**Labels.** Increments are `R1`–`R12`, not `v0.x`, because the app already shipped
`0.1.0` (`package.json`). Suggested tags (inferred, owner decides): R6 = `0.2.0`
(Milestone 1), R12 = `1.0.0` (full spec). Items marked *(inferred)* are my proposals,
not spec text; the plan for that increment must confirm them.

## 1. What "basic features" means for Milestone 1

Basic = a writer can capture, find, file and clean up plain notes on phone and
desktop without losing words.

| Capability | M1? | Why |
|---|---|---|
| Story 1: folder create, compose, first-line title, autosave, save failure/retry/expiry/conflict, body search | In | P1; the spec's minimum release |
| Folder create, name rules, permanent Notes folder | In | Story 1 cannot start without it (FR-001) |
| Folder rename | Out, not planned | The spec never asks for it; raise an issue if wanted |
| Move a note (Story 2.1) | In | With folders, a misfiled note needs a fix; it is one field update behind the revision check |
| Delete and recover a note, delete a folder (Story 3) | In | Cleanup is basic, and the spec has no permanent delete: soft delete is the only delete. Every query must exclude deleted notes, so building it late would mean re-testing every list |
| One-region phone layout, three columns at 810/1440, Account link, sign-out guard (Story 7.2, 7.3) | In | Story 1 runs phone to desktop; SC-005 needs zero horizontal scroll at all three widths; sign-out must stay reachable |
| Pin (Story 2.2) | Out | Helps a grown library; nothing else depends on it |
| Journal, Open Tasks (Stories 4, 5) | Out | Smart views over data M1 already stores correctly |
| Formatting UI, phone formatting bar, checklists UI (Story 6.1) | Out | Largest device-specific risk (software keyboard, visual viewport). M1 keeps the full document format and keyboard shortcuts, mounts no toolbar or menus |
| Attachments UI (Story 6.2 files, 6.3) | Out | Upload states multiply save states; the backend stays live and API-tested throughout |
| Collapse folders, writing focus (Story 7.1) | Out | Convenience for long sessions |

Consequence the owner should accept: from R2 until R8–R11, `main` has **fewer**
features than today's app (journal, favorites, Open tasks view and attachment UI
disappear and return). No user data exists, so nothing is lost.

## 2. Increments

Common exit criteria for every increment: `bun run lint`, `bun run knip`,
`bun run build`, `make e2e` (Chromium and WebKit) green; new checks added where
[verification.md](../../docs/testing/verification.md) puts that kind of behaviour
(API in `scripts/test-*.ts`, browser in `tests/e2e/*.spec.cjs`); feature doc under
`docs/features/` and `CHANGELOG.md` updated; live-stack run on `make start`.
Browser checks run at 390, 810 and 1440 px unless stated.

### Status

One row per increment. The ID never changes once a sub-spec uses it. Update Status and Sub-spec in the pull request that changes them.

**Status legend**: planned · in-progress · done

| ID | Increment | Depends on | Status | Sub-spec |
|----|-----------|------------|--------|----------|
| R1 | Data foundation | — | done | [r1-data-foundation](r1-data-foundation/spec.md) |
| R2 | Folders, list and compose with autosave | R1 | done | [r2-compose](r2-compose/spec.md) |
| R3 | Save resilience | R2 | done | [r3-resilience](r3-resilience/spec.md) |
| R4 | Search across folders | R3 | done | [r4-search](r4-search/spec.md) |
| R5 | Move, delete and recover | R4 | done | [r5-recover](r5-recover/spec.md) |
| R6 | Milestone 1 stabilization gate | R5 | in-progress | `r6-gate/` on branch `r6-gate` |
| R7 | Pin | R6 | planned | — |
| R8 | Journal smart folder | R6 | planned | — |
| R9 | Rich text, checklists and the phone formatting bar | R6 | planned | — |
| R10 | Open Tasks smart folder | R9 | planned | — |
| R11 | Attachments | R6 | planned | — |
| R12 | Workspace controls and full-spec acceptance | R7–R11 | planned | — |

### R1: Data foundation (backend only)

- **Goal.** `folders` and `notes` exist with final rules, hooks and API tests; the old UI keeps working on `entries`.
- **Covers.** FR-001; FR-003 revision part; privacy, folder-name and empty/oversized edge cases at API level. No story is user-visible yet.
- **Backend.**
  - `folders`: immutable `user`, `name`, `is_default`; unique index on `(user, name COLLATE NOCASE)` *(inferred)*; hook trims, rejects blank and reserved names (All Notes, Pinned, Journal, Open Tasks, Recently Deleted), blocks deleting the default. All five rules owner-only.
  - `notes`: immutable `user`, `folder` relation (not schema-required; a hook requires an owned folder on every active note, see section 4), `body` JSON, `attachments` relation, `revision`, `deleted` date, and server-derived `title` (first line, 160 chars), `text` (plain body text for search), `open_tasks`, `tasks`.
  - Default Notes folder created by a `users` after-create hook *(inferred; `pb/hooks/signup.pb.js` only gates signup today)*.
  - Attachment reference checks look at `notes` as well as `entries` until R2 drops `entries`.
- **Frontend.** None. `make codegen` output committed.
- **Reuses.** `pb/hooks/entries.pb.js` (validate + derive + transactional 409 revision check) copied for `notes`; `pb/hooks/entry-validation.js` `body()` and `tasks()` unchanged, `date()` loses `kind`; `scripts/test-entries.ts` as the template for a new `scripts/test-notes.ts`.
- **Exit.** `test-notes.ts` proves: A/B/anonymous denial for list, view, create, update, delete on both collections; forged `user`, foreign `folder`, foreign attachment refused; duplicate names differing only in case refused, same name allowed across accounts; concurrent saves, exactly one wins (409); forged `title`/`text`/`tasks` replaced; default folder exists for seeded and superuser-created users. Old suite still green.
- **Not here.** Any UI; setting `deleted`; pin and journal fields.

### R2: Folders, list and compose with autosave

- **Goal.** At all three widths a writer creates a folder, composes in one surface and sees the note saved after a pause.
- **Covers.** Story 1.1; 1.2 first half (reopen in second browser); 1.3 happy path; Story 7.2 (minus Search), 7.3 link; FR-002; SC-001; SC-005 no horizontal scroll.
- **Backend.** Drop `entries` (new migration); attachment hooks point at `notes` only; seed script writes folders and notes.
- **Frontend.** New `src/features/folders/`, `src/features/notes/`; routes under `src/routes/_authenticated/` for folder list, note list, note. Title is the document's first block (no separate input). Autosave: debounce, one in-flight save per note, later edits stay pending, flush on navigation. Note id generated on the client so a repeated create cannot duplicate *(inferred, see section 4)*.
- **Reuses.** Editor core `src/components/editor/examples/full/{editor.tsx,extension.ts}` with `Toolbar`, `InlineMenu`, `SlashMenu`, `BlockHandle`, `TableHandle` left unmounted (editor.tsx lines 59–76 mount them today); `bodyText()` from `src/features/entries/data.ts`; shadcn Sidebar/Sheet and `src/hooks/use-mobile.ts` (768 px breakpoint, so 810 is already "wide"); `/account` route and `src/features/account/security.tsx` unchanged; `src/components/nav-user.tsx` links.
- **Replaces/deletes.** `src/features/entries/*`, `src/features/tasks/*`, `src/components/app-sidebar.tsx`, routes `entries.*`, `dashboard.tsx` redirect target; `tests/e2e/{notebook,tasks,attachments}.spec.cjs` (attachments and tasks return in R10/R11 from git history); `scripts/test-entries.ts`, `scripts/seed-entries.ts`. Callers that name `entries` and must be updated in the same PR: `deploy/railway/verify-{app,restore,signup}.ts`, `tests/load/k6/script.js`, `tests/performance/editor.spec.cjs`, `tests/screenshots/capture.cjs`, `tests/e2e/smoke.spec.cjs`, `docs/design/notes-journal.md` (mark superseded).
- **Exit.** New `tests/e2e/notes.spec.cjs`: Garden → Compose → "Seed order" / body → Saved → second browser context shows one note with exact words; wrapped first line still one title; whitespace-only draft creates nothing; "Untitled note" for blank first line; folder-name errors keep the input. SC-001 measured: 20 warm Compose taps at 390 px, at least 19 accept a keystroke within 1 s. `scripts/test-attachments.ts` green against `notes`.
- **Not here.** Failure and conflict handling beyond a visible error; search; move; delete.

### R3: Save resilience

- **Goal.** No failure path loses a draft, overwrites a newer save or duplicates a note.
- **Covers.** Story 1.3–1.6 in full; Story 7.3 sign-out guard; FR-003; SC-002; SC-003; "interrupted actions" edge for saves; oversized and emptied-note edge.
- **Backend.** None expected.
- **Frontend.** Save status (pending, saving, saved, retry); Retry; leave guard with save / discard / keep editing; re-sign-in that keeps the draft for the same account only; conflict dialog with Copy draft and confirmed Reload saved; lost-acknowledgement recognition.
- **Reuses.** Logic lifted from the deleted `src/features/entries/entry-editor.tsx` (git history): `useBlocker` guard (l.137), same-account re-auth (l.132, 345–356), 401/403/400/404 handling and 409 conflict (l.262–282), reload-saved confirmation.
- **Exit.** `tests/e2e/save-resilience.spec.cjs` with request interception, one test per SC-003 scenario: failed save; response dropped after the server committed; retry after further typing; expiry mid-edit then same-account and other-account sign-in; two contexts on one revision. Each asserts: latest local text still visible, server holds exactly one note, newer server version intact, "Saved" never shown for unsaved text. SC-002: 3 s delayed response keeps pending feedback; retry feedback within 1 s of failure.
- **Not here.** Offline or crash recovery (out of spec scope).

### R4: Search across folders

- **Goal.** A body-only word finds its note from any folder, with folder name and highlighted snippet.
- **Covers.** Story 1.2 second half; FR-004; SC-004; empty-results edge; Story 7.2 Search placement.
- **Backend.** The [R4 plan](r4-search/plan.md) supersedes the inferred title/text filter and index order. Bind the substring against the existing derived `search_key`. Repair affected stored keys while preserving original writing, revision and dates. Index `user, updated DESC, id DESC, deleted`.
- **Frontend.** Search field at the bottom of the list on phone, above it on wide; results list (title, folder, bounded original-text snippet projected by the server and highlighted by the client); Back restores query and results; "No matching notes" with clear.
- **Reuses.** URL-held search state pattern from `parseSearch()` in the old `src/features/entries/data.ts`.
- **Exit.** API test: B and anonymous get zero matches for A's unique term; JSON keys such as "paragraph" do not match every note. Browser test: 100 notes in five folders, unique body term returns the right note and snippet; 20 runs, at least 19 under 2 s.
- **Not here.** Attachment-content search (out of scope); folder-only filter.

### R5: Move, delete and recover

- **Goal.** A writer refiles a note, deletes a note or folder, and restores within 30 days.
- **Covers.** Story 2.1; Story 3.1–3.3 for content and folder (pin, date, checklist and attachment parts are re-asserted in R7, R8, R9, R11); FR-005 move; FR-006; "interrupted actions" edge for move and delete.
- **Backend.** Folder-delete hook: one transaction sets `deleted` on its notes, clears their `folder`, removes the folder. Restore hook: refuses after `deleted + 30 days`, falls back to the default folder. Daily cron purges expired notes and their attachments (pattern: `cronAdd` in `pb/hooks/attachments.pb.js`). Move, delete and restore all carry `revision`.
- **Frontend.** Note actions menu (Move sheet, Delete); folder delete confirmation naming folder and note count; Recently Deleted view with deadline and Restore.
- **Exit.** API: stale-revision move/delete/restore is 409; restore past the deadline refused (deletion time set by superuser in the test); cross-account restore denied; deleted notes absent from list and search. Browser: move keeps the note open with the same URL; cancel paths change nothing; unsaved text stays copyable when the note was deleted in another context.
- **Not here.** Pin; restoring folders (spec: not restored).

### R6: "Basic" (Milestone 1): stabilization only

- **Goal.** Prove R1–R5 stable; ship nothing new.
- **Work.** Run the gate in section 3, fix what it finds, write `docs/features/notes.md` and `docs/features/folders.md` final text, refresh README screenshots via `scripts/capture-screenshots.sh`.
- **Not here.** Any feature. A feature request found here goes to an issue.

### R7: Pin

- **Goal.** One Pin action orders a folder and feeds a global Pinned view.
- **Covers.** Story 2.2; FR-005 pin; pin parts of Story 3.1/3.3.
- **Backend.** Add `pinned` bool; index. **Frontend.** Pin in note actions; pinned group at top of lists; Pinned smart folder.
- **Exit.** Pin survives move, delete and restore; a pinned note appears once in Pinned; deleted pinned notes are absent.

### R8: Journal smart folder

- **Goal.** Any note can carry a calendar date and appear in Journal.
- **Covers.** Story 4; FR-007 journal; date parts of Story 3.
- **Backend.** Add `journal_date` text (date-only), validated by `date()` in `pb/hooks/entry-validation.js`; index `(user, journal_date)`.
- **Reuses.** `src/features/entries/date-picker.tsx`, `localDate()`/`validDate()` (git history).
- **Exit.** Two notes in different folders share a day; day filter; date unchanged under a different browser time zone; opening Journal creates no record.

### R9: Rich text, checklists and the phone formatting bar

- **Goal.** Formatting and checklists are reachable on phone and desktop and survive reopening.
- **Covers.** Story 6.1; 6.2 formatting and checklist parts; FR-008 rich text; FR-009 phone editing state.
- **Backend.** None (the validator already accepts every node). **Frontend.** Mount toolbar and inline menu on wide screens; new bar pinned to `visualViewport` on phone with Done; reading/editing state.
- **Reuses.** `src/components/editor/ui/{toolbar,inline-menu,slash-menu}`.
- **Exit.** Automated viewport-shrink test (844 → 554 px) keeps the bar visible; round trip of heading, marks, lists, checklist states. **Physical iPhone and Android check** with keyboard open and dismissed (SC-005) recorded with device, OS, date.

### R10: Open Tasks smart folder

- **Goal.** Unchecked items across active notes can be completed in one place.
- **Covers.** Story 5; FR-007 tasks; checklist parts of Story 3.
- **Backend.** None: `open_tasks` and `tasks` are derived since R1, so no backfill.
- **Reuses.** `src/features/tasks/{data.ts,open-tasks.tsx}` and `tests/e2e/tasks.spec.cjs` restored from git history and repointed at `notes`, adding the `deleted` filter.
- **Exit.** Stale tick refused and list refreshed; other text untouched; last item shows the empty state; deleted notes contribute nothing.

### R11: Attachments

- **Goal.** Private images and files live inside the note and follow its deletion state.
- **Covers.** Story 6.2 files; 6.3; FR-008 files; attachment parts of Story 3; privacy edge for file links.
- **Backend.** Orphan cleanup must treat a soft-deleted note's references as live; R5's purge removes them at expiry.
- **Reuses.** `src/features/entries/{attachments.ts,attachment-list.tsx}`, `src/components/editor/ui/{image-view,image-upload-popover}`, `tests/e2e/attachments.spec.cjs` (git history); `scripts/test-attachments.ts` (kept green since R1).
- **Exit.** Autosave never reports Saved while an upload is pending; failed upload keeps the draft; attachment-only note is valid; restore brings files back; B cannot fetch A's file by direct link.

### R12: Workspace controls and full-spec acceptance

- **Goal.** Wide-screen controls and the whole spec re-verified together.
- **Covers.** Story 7.1; list-position restore in 7.2; FR-009 remainder; SC-005 keyboard-only journey; SC-006 re-run on the full app.
- **Reuses.** `WritingFocus` context and sidebar collapse from `src/features/entries/workspace.tsx` (git history).
- **Exit.** Focus mode hides both columns and restores their prior state; resize mid-edit keeps note and draft; keyboard-only: create folder, compose, search, move, focus returns after dialogs, open Account; light and dark checked.

## 3. Milestone 1 stabilization gate (R6)

R7 does not start until every line holds and the owner signs it off in the R6 pull request.

- **Bug bar.** Zero open issues labelled as data loss, privacy, duplicate note, or broken capture/find journey. Any other known defect is listed in the pull request with the owner's explicit acceptance. No `test.skip`, no retries added to pass.
- **Repeatability.** Full `make e2e` green on Chromium and WebKit three consecutive runs locally and green in CI on Linux amd64.
- **Coverage.** Every acceptance scenario of Stories 1, 2.1, 3 (content and folder parts), 7.2, 7.3 and every edge case in the spec maps to a named test; the mapping table is in the pull request. A scenario without a test is a stated gap, not silence.
- **Privacy.** `scripts/test-notes.ts` passes the full A/B/anonymous matrix: list, search, open, change, move, delete, restore, on notes and folders, plus forged owner, folder and attachment reference. Denials checked by status (empty list, 404, 400), not by an empty list alone.
- **SC-003.** The five save scenarios in `save-resilience.spec.cjs` pass 10 consecutive runs each on both browsers: zero drafts lost, zero newer versions overwritten, zero duplicates.
- **SC-001, SC-002, SC-004.** Measured and recorded with the numbers, not just pass/fail.
- **Widths.** Capture-and-find journey at 390, 810, 1440 with no horizontal scroll; screenshots reviewed in light and dark.
- **Physical phone.** On a real phone (Safari on iPhone at minimum): Compose places the caret with the keyboard up, typing stays visible above the keyboard, autosave and the leave guard work, session-expiry recovery works. Device, OS, date and result recorded as [verification.md](../../docs/testing/verification.md) requires. A WebKit viewport pass does not count.
- **SC-006.** The owner, unaided, completes Garden → Seed order → desktop body search within two minutes on a physical phone and a desktop browser.
- **Soak.** None. Owner decision (2026-11-18): the gate rests on tests, the physical-phone check and the SC-006 self-test; no deployed soak.

## 4. Dependencies and risks

Order: R1 → R2 → R3 → R4 → R5 → R6 gate. After the gate R7, R8, R9, R11 are independent of each other; R10 needs R9; R12 is last.

Decisions R1 must get right so later increments only add fields:

1. **New `notes` collection, not a reshaped `entries`.** The old UI keeps working during R1, and `kind` (immutable in the `entries` update rule, `pb/migrations/1792384947_created_entries.js`) disappears without a data migration.
2. **`folder` is not schema-required.** Deleting a folder must leave its deleted notes without one (Story 3.3). A hook enforces "active note has an owned folder". Making the relation required now would force a rule change in R5.
3. **`deleted` exists from R1 and every list query filters on it** through one shared helper. Otherwise R5 has to revisit list, search and later every smart view.
4. **`text`, `title`, `open_tasks`, `tasks` are server-derived from R1.** The earlier expectation of no R4 data repair is superseded by the authorized [comparison-key repair](r4-search/data-model.md#upgrade-and-rollback). Open Tasks (R10) still expects no backfill like `pb/migrations/1794796300_backfill_entry_tasks.js`.
5. **The document format is the full existing one from R1** (validator unchanged), so R9 is UI only and no note is ever migrated.

Risks:

- **Duplicate note on a lost create acknowledgement** (SC-003). A first autosave whose response is lost would be retried as a second create. *(inferred)* Mitigation: client-supplied record id; a repeated create fails as "id exists" and the client continues as an update. The mirror case, a lost acknowledgement on update, returns 409 against our own save; the client must fetch and compare before showing a conflict. Both belong in the R2/R3 plan and are the most likely source of gate failures.
- **Search in PocketBase.** `~` on the JSON `body` would match node names, hence the derived `text` field. The [R4 contract](r4-search/contracts/search.md) supersedes the early client-built snippet and raw LIKE proposals. R4 folds title and visible body text for literal matching, including accented and non-Latin writing, and returns a bounded three-part snippet on each of 20 rows. Full note text stays out of the search projection.
- **Editor weight and SC-001.** The editor bundle is about 2.3 MB uncompressed and took about 17 s cold on the simulated phone ([verification.md](../../docs/testing/verification.md) baseline). SC-001 is warm-start only, but R2 should preload the editor chunk from the list and measure.
- **Title as first line of a ProseKit document** is new behaviour (today there is a separate input, `entry-editor.tsx`). Unverified: whether the first block should be forced to a heading. R2 plan decides; the server derives the title either way.
- **Folder-name uniqueness** via `COLLATE NOCASE` is also ASCII-only. Same test as search.
- **Retention deadline.** *(inferred)* Expiry is enforced at restore time; the cron only reclaims storage, so a late cron run is not a correctness bug.
- **Deployment scripts.** `deploy/railway/verify-*.ts` change in R2 but cannot be run without the owner (they act on a real instance). They stay unverified until the owner runs them.
- **Reuse from git history** (R8, R10, R11, R12) assumes the pre-R2 commit stays reachable; record its SHA in the R2 pull request.

## 5. Mapping onto spec-kit

- **One spec, one plan and task list per increment.** `spec.md` stays the single approved spec; do not re-run `/speckit-specify`. The spec-kit scripts read a single `plan.md` and `tasks.md` from the feature directory (`.specify/feature.json` points at `specs/002-notes-redesign`; `check-prerequisites.sh` requires `plan.md` there).
- **Layout** *(inferred)*: give each increment its own folder, `specs/002-notes-redesign/r1-data-foundation/`, holding a `spec.md` that is a short scope stub (the R-section above plus the story/FR/SC ids it covers, linking back to the parent spec), then run `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement` with `SPECIFY_FEATURE` or `feature.json` pointed at that folder. Confirm on R1 that the scripts accept a nested directory; if not, use sibling folders `specs/002a-…`.
- **Scoping a run.** Pass the increment's section as the plan input: "Plan R3 only. In scope: Story 1.3–1.6, FR-003, SC-002, SC-003. Out of scope: everything under 'Not here'." The plan's constitution check and the tasks must not reach past it.
- **R1's plan carries `data-model.md` and `contracts/` for the whole spec** (all fields through R11, each tagged with the increment that adds it). Later plans reference it and change it only by addition.
- **R6 gets tasks but no design plan**: its task list is the gate in section 3.
- **One pull request per increment to `main`** (owner-confirmed 2026-11-18; `main` may lack old features between R2 and R11), since CI runs only for pull requests into `main` (`.github/workflows/ci.yml`). No release tag and no deployment before the R6 gate. Each pull request ticks its `tasks.md`, reports evidence and links the issue. If the spec text itself proves wrong, change `spec.md` in its own pull request first.
