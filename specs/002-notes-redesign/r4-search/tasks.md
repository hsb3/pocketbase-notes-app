# R4 tasks · Search across folders

**Input** [Scope A1–A5](spec.md), [plan and exclusive file ownership](plan.md#wave-slicing-input), [research](research.md), [data model](data-model.md), [search contract](contracts/search.md), [contained verification](quickstart.md). Check a task only after its evidence exists. Each task may write only the repo-relative paths labeled below. All tasks describe implementation following planning.

## W1 · Foundation and Story 1 / Story 3 search API (P1)

**[W1 exit commands](quickstart.md#w1-exit)** · A fresh and an upgraded database serve a bounded, literal, private search page. A receives the expected original-text snippet from a different folder. B, anonymous and deleted-note controls return zero. The ordinary R2 list and R3 writes still work. This slice can be built and verified before a frontend exists.

- [x] T001 [US1] **Modify** `scripts/test-notes.ts` and **Modify** `scripts/test-r2-upgrade.sh`. Add the independent [records API probes](quickstart.md#records-api) to the existing labeled case loop, including fresh create/update of the boundary title and embedded NUL, original source bytes, exact suffix mark/context, zero cross-boundary hits, exact title/body marks, distant grave accent, literal operands, authorization, deleted control and response bounds. Keep legacy key expectations for ordinary/fallback rows. First run `make test-api-contained` with just the new fresh assertions on R3. Capture the missing title row, missing post-NUL word and missing marked evidence separately. Next add the [staged upgrade](quickstart.md#staged-upgrade) through R3 using the specified title, NUL-only, deleted and ordinary legacy rows. Capture the actual marked owner page SQL and EXPLAIN it on the staged pinned engine. Require the named order-serving index and no temporary sort. Include post-up owner create and revision-checked PATCH, post-save baselines, exact current R3/R4 keys, no-write triggers on both target replays and atomic failure on the separate corrupt fixture. When running that test against R3, enumerate available migrations through R4, collect missing-index and unrepaired-key assertion results before aborting; never call down-one unless the intended R4 original or fixture copy is the newest applied migration. Run the API gate again and retain this staged red separately. Preserve the seed-codegen path and the R1/R2 replay and privacy controls.
- [x] T002 [P] [US1] **Create** `pb/migrations/1795000300_repair_active_note_search.js`. Implement the [transactional repair, index and inverse](data-model.md#upgrade-and-rollback) for affected active and deleted notes. Compare the complete R3 fold against the title-safe, NUL-to-LF R4 value. Install nonunique unconditional `idx_notes_user_updated_id_deleted` on `user, updated DESC, id DESC, deleted` before the repair in the same transaction. Down removes that index and restores current R3 keys. Both directions skip target rows. Leave applied migrations untouched. **Generator-only** `src/services/pocketbase-types.ts`: run `bash scripts/run-contained.sh codegen`, record the fresh double-generation exit and SHA-256, and compare to the tracked bytes. The staged proof belongs to the integrated W1 exit.
- [x] T003 [P] [US1] **Create** `pb/hooks/note-search.js` and **Modify** `pb/hooks/notes.pb.js`. Use the shared comparison helper and [key rule](data-model.md#comparison-key-on-every-validated-save) on every validated save. For marked lists, validate the canonical request and enrich only the already authorized rows. Select the matching original source using the one-for-one folded offset mapping across NUL, locate the original characters that contributed both endpoints even on fold parity, and clip the [bounded snippet](data-model.md#snippet-mapping). Extend the virtual export allowlist, keep ordinary excerpt/detail and hidden fields. On the integrated T001/T002/T003 tree run [all W1 exits](quickstart.md#w1-exit). The contained API run proves up/down/up across intervening writes, no-write replays, atomic abort, metadata and the actual owner page plan. Verify private marked hits and original snippets on both installations.

## W2 · Story 1 capture-and-find and Story 7 list controls (P1 / responsive placement)

**[W2 exit commands](quickstart.md#w2-exit)** · Real browser input finds notes across folders, opening and Back preserve the list and R3 draft guarantees, and all six cells meet SC-004. Verify Story 7 placement, keyboard flow and both themes independently of timing.

- [x] T004 [P] [US7] **Create** `tests/e2e/search.spec.cjs` with the [functional browser cases](quickstart.md#browser-behavior) using existing note helpers and session fixtures. Cover cross-folder title/actual folder/mark, two independent Back paths, page/scroll/focus, zero-hit Clear from folder and All Notes, held responses across query/account changes, error recovery, compound Unicode, direct URLs, dirty-save choices and independent owner reads. For each wide-detail paging, Clear and field Escape action, exercise failed flush/Keep editing and accepted PUSH/Back with the exact focus, history and stored-revision assertions. Check placement and both themes on each engine/width; keep screenshots as artifacts on successful runs. Before T006/T007 run the functional cases inside the contained browser runner and retain pre-UI failures at the missing search control. Do not weaken existing note tests.
- [x] T005 [P] [US1] **Create** `tests/e2e/search-timing.spec.cjs` following the six-cell [SC-004 protocol](quickstart.md#sc-004-timing) with the per-trial expected values, real response, page-side clock and inline sample attachment. **Modify** `scripts/run-contained.sh` to add `browser/search` to the allowed profiles, dispatch both search specs, one worker, no retries and list/html/json reporters. Tag only the six timing cases `@sc004`. Copy the JSON report and available screenshot directory out before teardown on either outcome. On green require all 24 uniquely named PNGs; a failed run with partial artifacts must retain its original failure. **Create** `scripts/check-sc004.py` to validate report cardinality, actual outcomes, sample identities and raw timings; reject a report with one missing cell, one duplicate trial or two values of exactly 2000 ms in a cell. Preserve default discovery, runner limits, deadline and resource cleanup. Record substantive pre-UI failure before T006/T007. Use the [W2 commands and report controls](quickstart.md#w2-exit).
- [x] T006 [US1] **Modify** `src/features/notes/data.ts` to share the active predicate, preserve the ordinary list signature and add the typed paged search with SDK binding and exact projection/options from the [contract](contracts/search.md#records-list). **Modify** `src/routes/_authenticated/_library.folders.$folderId.tsx` to validate `q`, `sp` and ordinary `page`. Implement bounded single-line parsing and stable query serialization for direct links and Back. Integrate with T007 before the W2 build/knip gate so all new exports have real callers.
- [x] T007 [US1] **Modify** `src/features/notes/note-list.tsx` and **Modify** `src/features/notes/workspace.tsx` to connect the field, actual folder labels, original-text mark, loading/error/empty states, paging, phone footer and wide header. Implement the [navigation/focus contract](contracts/search.md#navigation-and-focus) for ordinary folders, All Notes, Back and detail-side result selection. Scope asynchronous rows to the owner and active request, send wide-detail paging and Clear/Escape through R3’s blocker as a single PUSH on acceptance, restore editor focus on cancellation, keep successful-save refreshes, avoid stale restoration on remount, and preserve current Compose focus and ordinary-list scroll behavior. Verify T004 and T005 go green on both engines, pass the default browser suite including R2/R3 cases, and run unit/lint/knip/build checks.

## W3 · Evidence and release documentation

**[W3 exit commands](quickstart.md#w3-exit)** · A fresh reader can repeat the gates, inspect every SC-004 elapsed time and distinguish pass/fail from future physical-device acceptance.

- [x] T008 **Modify** `docs/features/notes.md`, **Modify** `docs/testing/verification.md` and **Modify** `CHANGELOG.md` with the delivered search behavior, scoped limits, runnable profile, actual per-cell counts/timing summary and raw-evidence location. Replace the stale “search in R4” future wording in the feature doc when behavior ships. Link the search issue and carry forward R6’s physical-phone and cross-device scope. Link measured [W2 evidence](quickstart.md#w2-exit) and run the [W3 exits](quickstart.md#w3-exit).
- [x] T009 **Modify** `specs/002-notes-redesign/r4-search/tasks.md` to record the integrated [gate evidence](quickstart.md#commands-and-release-evidence), exact commit tested, real and negative checker exits, 120 durations or a retrievable fixture-only report with them, screenshot locations and cleanup. Tick only verified tasks. Close the wave after scoped diff review and all required exits.

## R4 gate evidence

The coordinator reran the contained gates on 2026-11-19. The W1 backend commit was `7ce7bb623aa783aa18d6056e6e8b076eb564e37d`. The W2 client and integrated backend commit was `26f85a45cc4dffea5c786caf8ebe08af8bea324d`. The [release procedure](quickstart.md#commands-and-release-evidence) gives the commands and expected results.

| Gate | Exit | Observed result |
| --- | ---: | --- |
| W1 · `make test-api-contained` | 0 | The staged upgrade repaired 3 of 5 keys, including a deleted note. All other row values matched. After a create and edit, down/up changed 5 of 6 keys and reproduced all six rows. Both target replays wrote zero keys. The corrupt-key migration aborted atomically. The actual paged query used `idx_notes_user_updated_id_deleted` without a temporary sort. Fresh title, post-NUL, snippet, privacy and R3 write checks passed. |
| W2 · `CONTAINED_PROFILE=search bash scripts/run-contained.sh browser` | 0 | 46 cases passed once. Each of six engine/width combinations found 20/20 expected results under 2000 ms. Back restored the original row or focused Search if a save moved it off the restored page. |
| W2 · `make test-browser-contained` | 0 | 202 passed. The two signup-enabled cases were skipped under the default signup-disabled configuration. |

Before the fixes, the fresh and staged R3 API runs each exited 2. The fresh run missed a title-boundary match, a word after NUL and marked snippets. The staged run found the absent index and three unrepaired keys. On the W1 backend, the pre-UI search profile exited 1 with all 46 cases failing at the missing search control.

W1's separate fresh codegen command exited 0. Both generated copies matched the tracked bytes (SHA-256 `7578ceb820abeca8e9a6721cd8b6f0268d6acb76b6decedf61fa5532733b3ebc`). W2 passed 22 unit tests and its generated route tree matched HEAD after build. Both waves passed lint, knip, production build and scripts type-checking. The contained runs reported empty project container, network and volume inventories after teardown.

### Individual search timings

The table transcribes the W2 fixture timings in milliseconds, in trial order, from project `notes-test-15a92750ca3f3a6c3fbbbcdd`. The [verification guide](../../../docs/testing/verification.md#cross-folder-search) summarizes that run. The coordinator's independent search rerun also passed all six cells.

<details>
<summary>Show all 120 measured durations</summary>

| Trial | Chromium 390 | Chromium 810 | Chromium 1440 | WebKit 390 | WebKit 810 | WebKit 1440 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 161.6999999997206 | 116.6999999997206 | 89 | 71 | 51 | 54 |
| 2 | 50.8000000002794 | 51.6999999997206 | 53 | 49 | 37 | 50 |
| 3 | 47.60000000009313 | 48.10000000009313 | 56 | 44 | 44 | 47 |
| 4 | 62.10000000009313 | 52.60000000009313 | 52.10000000009313 | 34 | 33 | 35 |
| 5 | 44.60000000009313 | 52 | 51.40000000037253 | 33 | 41 | 50 |
| 6 | 46.59999999962747 | 48.39999999990687 | 53.39999999990687 | 32 | 36 | 45 |
| 7 | 51.09999999962747 | 56.60000000009313 | 57.200000000186265 | 37 | 37 | 36 |
| 8 | 48.1999999997206 | 47 | 47 | 34 | 45 | 33 |
| 9 | 49.200000000186265 | 49.8000000002794 | 46.09999999962747 | 30 | 38 | 55 |
| 10 | 52.89999999990687 | 47 | 60.1999999997206 | 45 | 45 | 39 |
| 11 | 47.5 | 46.10000000009313 | 50.700000000186265 | 50 | 48 | 56 |
| 12 | 49.89999999990687 | 45.799999999813735 | 51.1999999997206 | 53 | 47 | 53 |
| 13 | 42.8000000002794 | 50.89999999990687 | 55.700000000186265 | 36 | 45 | 35 |
| 14 | 50.09999999962747 | 51.10000000009313 | 53.60000000009313 | 31 | 39 | 56 |
| 15 | 49.200000000186265 | 50 | 51.60000000009313 | 35 | 38 | 39 |
| 16 | 41.60000000009313 | 51 | 51.299999999813735 | 42 | 45 | 50 |
| 17 | 61.39999999990687 | 47.90000000037253 | 56.60000000009313 | 44 | 42 | 34 |
| 18 | 50.90000000037253 | 50.39999999990687 | 44.90000000037253 | 37 | 45 | 31 |
| 19 | 53.799999999813735 | 47.39999999990687 | 49.3000000002794 | 57 | 49 | 50 |
| 20 | 42.799999999813735 | 46.6999999997206 | 48.1999999997206 | 35 | 31 | 45 |

</details>

The W2 release evidence bundle, `r4-w2-client-evidence`, retains the fixture-only Playwright report (`sc004.json`), trial identities and elapsed times (`durations.csv`), and 24 screenshots under `r4-search-views/<engine>-<width>-<theme>-<state>.png`. In a new run, the JSON and images are under the printed `test-results/<project>/` directory. W3 rechecked the retained JSON with `scripts/check-sc004.py` (exit 0). Three altered reports each produced exit 1. One lacked a cell, one repeated a trial number, and one had two trials at exactly 2000 ms in the same cell. The last control had only 18/20 strictly below threshold.

The W1 release evidence bundle, `r4-w1-backend-evidence`, retains the fresh and staged failures, codegen, API assertions and cleanup. The coordinator reruns are recorded in `r4-integration` as `w1-api.log`, `w2-search.log` and `w2-default.log`. Physical-phone keyboard and cross-device verification remain in R6.

W3 changed the four assigned documentation files. Agent-context validation, docs build and diff checks each exited 0, as did lint, knip, production build and scripts type-checking. Both generated files matched the tested implementation after build.

## Dependencies and handoffs

T001 red → T002 and T003 → W1 green. T004 (functional) and T005 (measurement) can be prepared independently against the same W1 backend. Both must demonstrate red before UI behavior changes. T006 supplies the route/data contracts to T007; integrate them as one buildable client change. T008 follows the W2 live proof; T009 is last. For a clean integration, only T009 owns the task file. Other tasks hand their check results to that writer. The [whole-file budgets](plan.md#wave-slicing-input) apply to every handoff.
