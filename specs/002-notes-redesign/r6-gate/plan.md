# R6 plan · Milestone 1 stabilization

**Branch** `r6-gate` from `6ee597e`. This is an execution plan for the existing milestone. The product design remains in the [parent spec](../spec.md) and the [M1 gate](../versions.md#3-milestone-1-stabilization-gate-r6). One increment PR closes [Milestone 1 stabilization](https://github.com/hsb3/pocketbase-notes-app/issues/41). Record actual results against a candidate SHA. [Wave tasks](tasks.md) · [Commands and evidence](quickstart.md) · [Owner runbook](owner-check.md)

### G1 · Bug bar

At intake and again before sign-off, query all open issues and available labels with the two `gh` commands in the quickstart. The November 19 inventory has 17 open issues including the pinned index (16 excluding it), two labelled bug. There are **no dedicated severity labels** for data loss, privacy, duplicate note or capture/find. Inspect issue bodies, owner reports, traces and unfiled findings against all four conditions. A zero count from a label filter cannot close this gate. The pinned [backlog view](https://github.com/hsb3/pocketbase-notes-app/issues/48) lists the nine UAT issues. Seven enhancements (58–64) remain future work.

| Known report | Recommendation for owner disposition |
|---|---|
| [Checkbox-first note has trouble saving/retitling](https://github.com/hsb3/pocketbase-notes-app/issues/56) | Owner ruled nonblocking on November 19. List the save/retitle report for explicit acceptance in the R6 PR. The source check below found no evidence of lost words or duplicate notes. |
| [Flicker while saving or navigating](https://github.com/hsb3/pocketbase-notes-app/issues/57) | Owner ruled nonblocking on November 19. List the reported flicker for explicit PR acceptance. Separate research owns measurement. |
| Back shown in note pane at 1440 | Keep working Back/search-return behavior. Recommend explicit acceptance in the R6 PR. |
| Conflict dialog repeats a status sentence | Both copies refer to the same conflict. Recommend acceptance in the R6 PR if Copy/Cancel/Reload and their announcements remain usable. |
| Empty search has an icon-only Clear | The button has an accessible name and keyboard coverage. Recommend accepting the visible-label polish in the R6 PR if T002 proves Clear works. |
| Phone rows lack the proposed grouped rounded card | Recommend acceptance in the R6 PR; wide Compose placement and gold-accent differences from the design study go on the same visual review list. Reclassify if controls are actually unreachable. |
| MFA redirect intermittently checks a page removed by clampPage | Fix in W4. Keep the return-query assertion by seeding 21 notes. An assertion against the default redirect alone would also pass if MFA discarded the redirect. |

**Unexpected defect protocol.** Stop the failing series. Save exact SHA, command, numeric exit, case, fresh isolated project and cleanup, observed vs expected, synthetic before/after state and smallest reproducible trace. Coordinator records an issue or links the existing one and classifies it against G1 with the owner. Only a confirmed major defect in the four G1 classes qualifies for a product fix. Report evidence to the coordinator before any fix is scoped. Once authorized, record a red regression on the predecessor, named files with measured caps, minimal correction, live green on the same assertion, and fresh series. Other defects need individual acceptance in the PR. A feature gets an issue, remains outside the increment. No individual wave decides release severity. Unknown reproducibility stays explicit. A new observation suggesting a major defect returns to the coordinator, including evidence against an earlier nonblocking ruling.

### G2 · Repeatability

W6 runs the [three full rounds](quickstart.md#three-full-runs-and-ten-recovery-runs) on one clean candidate. Each contains default contained API, default browser and the enabled-registration browser. Record exact discovered/passed/skipped counts, SHA and three empty cleanup inventories for each invocation. W3 settles configuration skips and proves the plain-stack selection separately. Before PR also run operator, accounts and restore (plain CI runs `test:accounts`), performance and captures. Hosted green Linux amd64 only, actual job durations and commit URLs in the ledger. CI's 40-minute E2E cap stands. The previous PR needed 17m58s on the final amd64 run; one earlier job took 34m38s. W4 explicitly corrects the architecture sentence in versions.md §3.

### G3 · Coverage

Use the [17-row scenario and edge inventory](coverage.md). W1 measures gaps before changing behavior. W2 extends authenticated/guest controls. W7 links the finalized inventory from the human verification guide and pastes it in the PR with any remaining gaps named. Record out-of-M1 clauses as stated gaps. The owner will reset the roadmap after R6.

### G4 · Privacy

Once per full round run `make test-api-contained`. It executes test-notes.ts with real sessions and calls test-note-actions.ts under the contained flag. The [operation-by-operation matrix](coverage.md#privacy-evidence-through-scriptstest-notests) identifies already-proven custom 401/404, collection 400/404, positive controls and three missing probes (folder name filtering, retained-ID restore with a valid revision, populated-folder confirm with valid snapshot). Record full-response sentinel checks, independent records before/after and positive file bytes. No changes to access rules are planned.

### G5 · SC-003

One `CONTAINED_PROFILE=resilience make test-browser-contained` invocation validates 30 keys once. Ten independent consecutive invocations, same tree, one worker, no retries. Require 300 first-attempt passes across five scenarios, two engines and three widths. Save each sc003.json and checker exit, report zero draft losses/overwrites/duplicates. Source tests independently read committed state and reopen. [Series commands](quickstart.md#three-full-runs-and-ten-recovery-runs)

### G6 · SC-001, SC-002 and SC-004

W1 retains actual default browser JSON for healthy and failure timing attachments plus warm Compose stdout. W6 runs the existing search profile and its sample checker as well. Use the [numeric criteria and historical reference values](quickstart.md#three-full-runs-and-ten-recovery-runs); report raw samples plus per-engine/cell counts and ranges, distinguishing references from R6 results.

### G7 · Widths and evidence

At 390/810/1440 drive the complete newly created note to search/return and assert zero horizontal overflow state by state in light/dark on both engines. W6 reviews 72 journey stills plus action/search evidence; W5b runs both clients changed in b99ec74. Each evidence handoff follows the [cumulative recording and release comparison](quickstart.md#visual-evidence). W5c supplies measured README derivatives separately from the changed-screens-only release archive.

### G8 · Physical iPhone

Owner selects transport before setup. Recommended private-LAN disposable stack, alternatives private HTTPS tunnel or matching existing Railway build. [Exact setup, taps, invalidation and evidence fields](owner-check.md). W7 records actual Safari, keyboard/caret/visibility, autosave, leave and same-account recovery. A fresh emulated WebKit run cannot fill these cells.

### G9 · SC-006

Start signed into the same throwaway account on iPhone and desktop; run the unaided Garden task first, stopwatch at first action, end on the opened desktop note found by body term. Record seconds, exact result, absence of prompts/help and both devices. W7 waits for the owner. Pass ≤120 seconds. [Timed instructions](owner-check.md#sc-006--run-this-first)

### G10 · Soak and release

No deployed soak, new upgrade fixture, tags or deploy commands in waves. Existing staged fixture still runs as part of ordinary API acceptance. Owner decides on a separate 0.2.0 release after sign-off and merge, following the release guide's version/changelog prerequisites. Recommend deferring that decision until the signed gate. No crew refreshes notes-play or changes a real instance.

**Checkbox source check (6ee597e).** The actual `entry-validation.js` validator and visibleText accepted a text-bearing task (“Mulch”), an empty task followed by body text (“\nMulch”), and literal “[ ]”; they rejected a wholly empty task with no attachment. `pb/hooks/notes.pb.js:34` derives the title separately from the first logical line. `src/features/notes/draft.ts:239` keeps the edited body in memory; its invalid-content path at line 421 leaves a saved note dirty and calls fail without replacing the local body or writing an empty record. Submission at line 462 reuses the draft ID and revision. `src/features/notes/data.ts:197` creates with that ID only for a new note; saved records use revision-checked update. These paths show neither silent word loss nor a second record for this report. The owner's editor sequence was not reproduced. Any contrary observed loss/duplicate goes directly to the coordinator with evidence; neither report has an R6 fix task.

## Documentation scope

W5a moves folder naming, default/All Notes, move, deletion, recovery destination and Account navigation into folders.md. notes.md keeps Compose/title, save states, limits, search/Back, revision conflict and draft recovery; preserve existing referenced anchors or update callers within the wave. Keep history/backup guidance. The sidebar and routed docs registry point to the canonical pages. Retain CONTRIBUTING.md as a short owner/agent index: issue/spec trigger, PR-only main and evidence, setup, verification and security links. Remove the public welcome/contributor agreement, duplicated install/test commands, repeated contribution rules and tutorial on proposing features. Hard limits remain in AGENTS.md.

W5c rewrites README's first screen around today's phone-capture/desktop-find journey, move/delete/restore and real screenshots; fix stale “Search planned” and “conflict recovery outside” claims. Keep a short Docker quick start, local stack and human doc links, data-loss/backup warning and the current M1 gate and the owner’s forthcoming roadmap reset. W7 corrects stale architecture lines in verification and CI docs, updates changelog only for delivered visible/operator changes and records actual checks. Retain dated historical benchmark, design, license and source-recovery material. Checked scope includes architecture, CI/release, setup/root-files, auth/tasks/attachments, load testing, verification, historical design HTML/stills and docs/images; legacy images stay historical. Recheck all doc links/descriptive claims at exit. Use a measured follow-up slice for any newly discovered substantive drift outside assigned files.

## Constitution and decisions

Backend validation stays server-authoritative, custom commands enforce auth, all new privacy checks use real owner/foreign/guest sessions. Preserve revision guards, one ID and all latest words. No feature, schema or dependency planned. If a schema fix proves necessary, stop for spec and backend-first sequencing; new hand-written migrations are permitted, applied ones immutable. Only generators may update derived files. Reuse installed React, ProseKit, shadcn and PocketBase. All crew live servers/browsers stay under the contained runner's existing resource and isolation limits. Verify build and live behavior before integration.

Owner decisions: approve CI running the 12 ageing cases in a parallel amd64 contained job (recommended) or explicitly waive their plain CI absence; approve phone transport (recommend disposable private LAN); accept/resolve each G1 residual defect; sign the evidence including G8/G9; separately decide on a 0.2.0 tag after merge. These are decisions, not assumptions of consent.

## Wave slicing input

One fresh crew per wave. Sequential handoffs W1 → W2 → W3a → W3b → W4 → W5a → W5b → W5c → W6 → W7. A wave delivers buildable, testable work; a red regression is evidence on the predecessor, never the integrated wave exit. Commands in [wave exits](quickstart.md#wave-exits) include shared gates. All quantities below are decimal kB of **whole files**, measured on 6ee597e by wc -c, rounded upward to 0.1. New-file values and final ceilings are budgets; remeasure actual bytes before dispatch, before writing media, and before integration. Hard cap 10 written files/100,000 B, target 85,000 B. Do not count a read as a write. Generated images written into checkout count. Build/cache/screens/report outputs generated in isolated verification copies count zero. No generator-only route or type file authorized: an unexpected writeback in the delivery checkout stops the wave. No agent modifies this ledger during intermediate waves; W7 records all exits.

| Wave and tasks | Per-task owned checkout files (current size or creation allowance) | Files / planned final ceiling | Exit |
|---|---|---|---|
| W1 establish proof | T001 Modify `scripts/run-contained.sh` 13.0; Create `scripts/check-r6.py` ≤6.0. T002 Create `tests/e2e/m1-journey.spec.cjs` ≤9.0. | 3 / 32 kB | baseline + journey + search |
| W2 private API | T003 Modify `scripts/test-notes.ts` 40.4 and `scripts/test-note-actions.ts` 23.9. | 2 / 73 kB | privacy |
| W3a signup configurations | T004 Modify `playwright.config.ts` 1.6, `tests/e2e/registration-enabled.spec.cjs` 2.3, `scripts/test-mfa.ts` 13.1, `scripts/check-r6.py` W1 ≤6.0, `scripts/run-contained.sh` 13.0 at base, `docs/development/root-files.md` 18.2, `.github/workflows/ci.yml` 5.6. | 7 / 73 kB | signup on/off API and UI |
| W3b ageing configurations | T005 Modify `tests/e2e/recently-deleted.spec.cjs` 33.4, `scripts/run-contained.sh` 13.0 at base, `scripts/check-r6.py` W1 ≤6.0, `.github/workflows/ci.yml` 5.6, `playwright.config.ts` 1.6, `docs/development/root-files.md` 18.2. Waiver branch owns only necessary runner/checker changes. | ≤6 / 87 kB | recover, plain, full; separate CI job on PR if elected |
| W4 stabilization | T006 Modify `tests/e2e/two-step.spec.cjs` 6.9 and `specs/002-notes-redesign/versions.md` 22.8. | 2 / 32 kB | redirects, docs |
| W5a guides | T007 Modify `docs/features/notes.md` 11.7; Create `docs/features/folders.md` ≤5; Modify `.vitepress/config.ts` 7.4, `.agents/context/docs.md` 3.3, `docs/development/root-files.md` 18.2. T008 Modify `CONTRIBUTING.md` 3.7, `docs/architecture/spec.md` 1.1. | 7 / 57 kB | docs and links |
| W5b captures | T009 Modify `tests/screenshots/capture.cjs` 8.2. Run existing capture shell and performance spec without writeback. | 1 / 16 kB | screens, perf |
| W5c current README | T010 Modify `README.md` 4.6. Create (generator-only derivatives) `docs/images/m1-notebook-light.jpg` and `docs/images/m1-mobile.jpg`, measured samples 45.7 and 31.9. | 3 / 92 kB | docs and visual read |
| W6 machine evidence | T011 run series, T012 review evidence, external `reports/r6-<sha>.*` only. | 0 / 0 kB | full final series and carry-overs |
| W7 owner and PR evidence | T013 owner record external; T014 Modify `coverage.md`, `tasks.md` in this folder (current source sizes 9.6 and 12.6, final allowances ≤18 and ≤20), `docs/testing/verification.md` 20.5, `docs/ci/checks-and-rules.md` 8.0, `CHANGELOG.md` 8.6. | 5 / 76 kB | physical results, docs, amd64 PR checks, owner sign-off |

The 2.37 MB legacy GIF and 311 kB phone PNG each exceed an entire wave. Split repeatable capture work from the new README image files; never replace those binaries inside a capped wave. If the current JPEGs exceed W5c's allowance, split one readable derivative into its own measured wave before checkout writeback. If either single file approaches 100 kB, regenerate from the original at JPEG q=7 and review at 1:1. No budget exception is assumed.
