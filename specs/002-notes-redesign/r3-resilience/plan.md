# R3 implementation plan · Save resilience

**Branch** `r3-resilience` · **2026-11-18** · [Scope and acceptance](spec.md) · [Save resilience work item #38](https://github.com/hsb3/pocketbase-notes-app/issues/38)

## Deliverable

A writer can recover the latest words after a failed save, lost reply or expired session. Two editors racing on the same revision keep both the winner's saved document and the loser's local draft. The release proof is the [five-scenario browser matrix](quickstart.md#five-sc-003-scenarios), independent owner reads of the exact body/revision and one record per intended note. On a healthy connection a pause starts saving within one second. A three-second delay must preserve pending feedback. Known failure must expose Retry within one second.

Extend the R2 React 19 / TanStack Router / ProseKit client, its singleton PocketBase SDK ^0.28 client and its Bun and Playwright suites. R1's PocketBase 0.40.x records rules, revision transaction and 102400-byte JSON field supply the backend. R3 needs no migration, code generation, new dependency or deployment. [Research and source decisions](research.md) · [In-memory model](data-model.md) · [Editor contract](contracts/editor.md)

## Save, recovery and navigation

1. **Track what was sent.** Keep R2's 500 ms debounce and one in-flight write per note. Store the expected server result separately from the live body. Header feedback is Idle (empty), Pending, Saving, Saved, or an actionable error with Retry. All three widths keep the status visible. On failure stop automatic sends, allow typing and route explicit Retry through the same pump. Advancing the revision can acknowledge only the submitted generation.
2. **Resolve uncertain writes as the owner.** For lost POST/PATCH replies, ID collisions or a 409, fetch the same ID. Match the full JSON, owner, folder, attachment order and expected revision. An exact match acknowledges the submitted generation. An ambiguous missing create may retry the original ID after verifying the owner. An unchanged update baseline permits a revision-checked Retry. A different saved record enters conflict; a confirmed collision with an unreadable record stops. A failed diagnostic read leaves the draft unresolved. The [decision table](data-model.md#owner-read-back) also covers validation, masked auth failures and deletion.
3. **Guard every exit.** Preserve the automatic successful flush for normal navigation. If it fails, hold the pending destination and offer Save and continue, Discard and Keep editing. Dirty sign-out offers the three choices before any logout side effect. Consolidate the current editor Back and Compose pre-flushes with the router blocker so all links, programmatic actions and browser history share the decision. Only hard exits use the browser's native warning. The [leave contract](contracts/editor.md#leave-and-sign-out) defines when each action may proceed.
4. **Restore only for the same owner.** On expiry, suspend the exact draft above the keyed library, stop writes and hide private content. Preserve the existing login/MFA/OAuth flow. Resume only by the authenticated ordinary account's record ID; B gets their own library even when A's draft or a late read/ack is still in this tab. Once A returns, Retry reconciles unresolved work before saving. Keep the suspension in tab memory. [Reauthentication contract](contracts/editor.md#reauthentication)
5. **Protect both versions.** Copy draft takes the latest visible words. Cancel keeps the local version editable and the conflict reopenable. Reload saved requires a second confirmation and a successful current owner read. A failed reload never clears the draft. Restore shadcn AlertDialog during implementation for destructive confirmations. Empty/oversized edits retain the full input and last valid server version. Preserve previously valid rich and attachment-only notes. [Dialog and editor behavior](contracts/editor.md#conflict)

## Constitution check

| Principle | Intake and post-design disposition |
|---|---|
| Backend first | Pass. R3 consumes the standard R1 records and uses the existing owner rules and revision hook. All new state is ephemeral client state. |
| Server-enforced privacy | Pass. Real owner read-back, identity checks across asynchronous completions and fresh A/B sessions verify isolation. Supplied client IDs never authorize adoption. |
| Preserve writing | Pass. Retry is serialized and revision-checked, including after reauthentication. Destructive replacement requires confirmation. The only deliberate losses are explicit discard/reload or leaving the in-memory session. |
| Smallest complete change | Pass. Reuse the draft, data service, router blocker, existing login and shadcn primitives. Restore one removed UI primitive from the registry. Preserve the pinned packages and generated files. |
| Live verification | Pass as design. Contained API and browser checks exercise the production build on real PocketBase. SC-002 records milliseconds. SC-003 has five named failure scenarios on both engines with explicit cardinality and revision assertions. Implementation and R6 own the runtime results. |

## Delivery order

Tests and repeat-run support precede behavior changes. Build read-back and the single save pump first, then attach status and conflict controls. Stage owner-bound suspension before routing any recovery through sign-in. Integrate the leave guard after failure, conflict and expiry have distinct outcomes. Run the [validation guide](quickstart.md) and update the feature doc and changelog during implementation. The gated R6 repeats and physical phone checks are future release evidence.

To run Spec Kit from this worktree, set `SPECIFY_FEATURE_DIRECTORY=specs/002-notes-redesign/r3-resilience` and `SPECIFY_FEATURE_NO_PERSIST=1` for the command. [Implementation checklist](tasks.md)

## Wave slicing input

Whole-file estimates below are decimal kB. Existing sizes are rounded up from this R2 checkout, increased where a file will grow; new files are estimates. Count each unique path once per slice. Recheck at handoff against R2's limits of 10 files and 100 kB. File ownership is exclusive between handoffs. Test evidence belongs outside source ownership.

| Task | Owned paths (kB) | Files / kB | Shared with |
|---|---|---:|---|
| T001 | `tests/unit/note-draft.test.cjs` (17) | 1 / 17 | — |
| T002 | `scripts/run-contained.sh` (11), `scripts/check-sc003.py` (3) | 2 / 14 | — |
| T003 | `tests/e2e/notes.spec.cjs` (23), `tests/e2e/note-helpers.cjs` (4), `tests/e2e/save-resilience.spec.cjs` (16) | 3 / 43 | T004 |
| T004 | `tests/e2e/save-resilience.spec.cjs` (23) | 1 / 23 | T003 |
| T005 | `tests/e2e/note-recovery-controls.spec.cjs` (12) | 1 / 12 | — |
| T006 | `src/features/notes/data.ts` (5) | 1 / 5 | — |
| T007 | `src/features/notes/draft.ts` (11) | 1 / 11 | T009, T010 |
| T008 | `src/components/ui/alert-dialog.tsx` (6), `src/features/notes/note-editor.tsx` (4) | 2 / 10 | T010 |
| T009 | `src/features/notes/draft.ts` (12), `src/features/notes/suspended-draft.ts` (3), `src/features/notes/workspace.tsx` (10), `src/routes/auth/login.tsx` (2) | 4 / 27 | T007, T010, T011 |
| T010 | `src/features/notes/draft.ts` (13), `src/features/notes/note-editor.tsx` (6), `src/features/notes/conflict-dialog.tsx` (4) | 3 / 23 | T007, T008, T009 |
| T011 | `src/features/notes/workspace.tsx` (12), `src/features/notes/leave-dialog.tsx` (3) | 2 / 15 | T009 |
| T012 | `docs/features/notes.md` (9), `docs/testing/verification.md` (17), `CHANGELOG.md` (9) | 3 / 35 | — |
| T013 | `specs/002-notes-redesign/r3-resilience/tasks.md` (14) | 1 / 14 | — |

Handoff order for shared files: browser scenarios T003 → T004; draft T007 → T009 → T010; editor T008 → T010; workspace T009 → T011. Existing logout, account menu and login form are integration points. The plan uses their normal route entry/completion and changes the workspace guard and login route only. T013 records verified results after the integrated gates pass.
