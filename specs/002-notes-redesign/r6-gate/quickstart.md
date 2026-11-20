# Execute and record the R6 gate

Use Bash, frozen dependencies and a disposable verification checkout at the assigned predecessor. Only the coordinator pushes or dispatches hosted CI. All crew live tests use the capped runner. [Runner prerequisites](../../../docs/testing/verification.md#disposable-docker-gates)

## Evidence setup

The coordinator creates **one** private increment root before W1 and supplies its absolute path to each wave. W1–W7 share it. Use synthetic data only. Reports can contain disposable credentials. Publish sanitized decisions, numbers and hashes.

```bash
umask 077
R6_REPORTS="$HOME/.local/share/agent-artifacts/pocketbase-notes-app/reports"
mkdir -p "$R6_REPORTS"
export R6_OUT=$(mktemp -d "$R6_REPORTS/r6-gate.XXXXXXXX")
mkdir -p "$R6_OUT"/{issues,defects,phone,visual,ci}
```

In each wave set `R6_WAVE` to its table ID (for example `W3b`), export the assigned `R6_OUT` and paste this block at the candidate checkout. Make a new attempt on failure. Hand off the absolute attempt path. A receipt records the actual command, combined output and numeric exit, including failed checks.

```bash
set -euo pipefail
umask 077
unset CONTAINED_PROFILE
: "${R6_OUT:?}" "${R6_WAVE:?}"
mkdir -p "$R6_OUT/$R6_WAVE"
R6_RUN=$(mktemp -d "$R6_OUT/$R6_WAVE/attempt.XXXXXXXX")
R6_SHA=$(git rev-parse HEAD)
printf '%s\n' "$R6_SHA" > "$R6_RUN/commit.txt"
git status --short > "$R6_RUN/worktree.txt"
BASE=specs/002-notes-redesign/r6-gate/baseline-6ee597e.jsonl
receipt() {
  local name=$1 status=0
  shift
  test ! -e "$R6_RUN/$name.command" || return 2
  printf '%q ' "$@" > "$R6_RUN/$name.command"
  "$@" > "$R6_RUN/$name.log" 2>&1 || status=$?
  printf '%s\t%s\n' "$name" "$status" >> "$R6_RUN/exits.tsv"
  return "$status"
}
gate() {
  local name=$1 status=0 project kind
  shift
  receipt "$name" "$@" || status=$?
  project=$(sed -nE 's/^Contained [^ ]+ gate: (notes-test-[0-9a-f]+)$/\1/p' "$R6_RUN/$name.log")
  if [[ $project =~ ^notes-test-[0-9a-f]{24}$ ]]; then
    if [[ -d test-results/$project ]]; then cp -R "test-results/$project" "$R6_RUN/$name.files" || status=1; fi
    for kind in container network volume; do
      grep -Fx "cleanup $project $kind: empty" "$R6_RUN/$name.log" >/dev/null || status=1
    done
  else
    status=1
  fi
  printf '%s\t%s\t%s\n' "$name" "$project" "$status" >> "$R6_RUN/gates.tsv"
  return "$status"
}
```

| External path under `$R6_OUT/` | Writer and content |
|---|---|
| `issues/initial.json`, `issues/initial-labels.json`; `issues/final.json`, `issues/final-labels.json` | W1 and T014 respectively. Retain issue bodies, labels, URLs and both snapshots. |
| `defects/<slug>.md` | One file per report, with issue/body or observation, SHA, evidence path/cell, G1 class, repro or inference, owner decision/date. Stable slugs in plan G1. For a new issue use its number. Each gets one PR decision line. |
| `W1/attempt.*/baseline-list.log`, `W1/attempt.*/baseline-keys.log`, `<wave>/attempt.*/<name>.{command,log}`, `exits.tsv`, `gates.tsv` in that attempt | Original discovery, normalized keys, command/exit receipts for contained, shared, checker and negative runs. Preserve every attempt. |
| `w6.sha`, `w6-attempt.txt`, `measurements.tsv`, `privacy.tsv`, `visual/manifest.tsv`, `phone/results.tsv` | Accepted W6 clean SHA and absolute attempt path, timing rows and A/B/guest HTTP/readback rows with raw source pointers, per-cell visual decisions, physical/unaided results. |
| `ageing-decision.txt`, `ci/dispatch.json`, `ci/runs/<id>/artifacts/`, `ci/pr.json`, `signoff.md` | Owner/date/reason, tested SHAs and hosted receipts, final head, merge ref, run/job URLs, individual decisions and owner sign-off. Put updated identities in the PR and external ledger. |

At intake set `phase=initial`; in T014 use `phase=final`. Run from the intended repository. Stop on a truncated inventory (raise the limit and repeat with a new receipt).
```bash
receipt "issues-$phase" gh issue list --state open --limit 500 --json number,title,body,labels,url
receipt "labels-$phase" gh label list --limit 200 --json name
cp "$R6_RUN/issues-$phase.log" "$R6_OUT/issues/$phase.json"
cp "$R6_RUN/labels-$phase.log" "$R6_OUT/issues/$phase-labels.json"
```

## Wave exits

Run the shared checks on the verification copy. Include context and docs for doc/config changes. At pre-PR run the three CI-specific shared checks too. The default contained API gate already executes `bun test scripts/local-target.test.ts`. Keep each command's receipt. A missing tool or unexplained write goes to the coordinator.

```bash
receipt unit bun test tests/unit
receipt lint bun run lint
receipt knip bun run knip
receipt script-types bun x tsc -p scripts/tsconfig.json
receipt build bun run build
receipt context python3 scripts/ai-context.py check
receipt docs bun run docs:build
receipt diff git diff --check
receipt writebacks git diff --exit-code
# Pre-PR, with the workflow's lychee v0.24.2 and pinned actionlint image:
receipt audit bun audit
receipt links lychee --offline --include-fragments --no-progress --exclude-path .agents/skills --exclude-path .claude/skills --exclude-path .specify/templates '**/*.md'
receipt workflow-lint docker run --rm --network none -v "$PWD:/repo:ro" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
```

| Wave | Additional exit (prefix each live command with `gate NAME`) |
|---|---|
| W1 | Run the predecessor, instrumented baseline, journey, policy, metrics and discovery checks below. Run `gate search env CONTAINED_PROFILE=search make test-browser-contained`. |
| W2 | `gate privacy make test-api-contained`. Assert independently persisted state, status and sentinels in the [privacy table](coverage.md#privacy-evidence-through-scriptstest-notests). |
| W3a | `gate off make test-api-contained`; run browser profiles signup, signup-disabled and default. Retain mode-bound API receipts and browser pairs. A deliberately mismatched signup flag must fail. |
| W3b | Run browser profiles default, plain, signup, recover as `full`, `plain`, `signup`, `recover`. Run the exact compare, policy and negative checks below. |
| W4 | `gate redirects env CONTAINED_PROFILE=plain make test-browser-contained`. Same seeded page-two row and query after MFA in both engines and viewports. |
| W5a | Read built sidebar, notes/folders and retained anchors. |
| W5b | `gate screens scripts/capture-screenshots.sh`, `gate perf env CONTAINED_PROFILE=performance make test-browser-contained`. Inspect captured states, recording and production editor report. |
| W5c | Derive the two measured JPEGs below, check total ≤92,000 bytes including final README before copying, view rendered images. |
| W6 | Run the local series and review on one clean candidate. Record SHA and absolute attempt directory externally on success. |
| W7 | Run the [owner check](owner-check.md), final issue query, complete-tree comparison, shared checks and coordinator-hosted pre-PR/PR checks below. |

## W1 predecessor and independent inventory

[The pinned baseline](baseline-6ee597e.jsonl) contains 326 unique keys, 163/project. Its SHA-256 is `5abdf3b192ab5f91e8ad515f9de06c27c61ca4ac8548d7a9699075b93aca0721`. Each JSON line is `[repo-relative file, [all named describe ancestors, leaf title], projectName]`, sorted by that tuple. Omit the reporter's file-suite wrapper and anonymous suites. No line numbers, test IDs or leaf-title-only matches. This is actual list-only discovery on the exact base, independent of any future selector.

Use a clean disposable checkout of the full base SHA below with frozen dependencies. Supply its path in `R6_BASE_TREE`. Capture the genuine predecessor runs unchanged. Their default success log has no full JSON or per-title attempt archive. Keep that limitation visible. From the W1 verification copy, rerun discovery without contacting a server:

```bash
(
  cd "${R6_BASE_TREE:?}"
  test "$(git rev-parse HEAD)" = 6ee597e26bd4333bdbb6e37173fe8dab6449248e
  test -z "$(git status --porcelain)"
  receipt baseline-list env -u PLAYWRIGHT_JSON_OUTPUT_FILE CI=1 VITE_PB_URL=http://127.0.0.1:8080 TEST_APP_URL=http://127.0.0.1:8080 PB_EMAIL=list@example.test PB_PASSWORD=list-only node node_modules/playwright/cli.js test --list --reporter=json
  gate base-api make test-api-contained
  gate base-browser make test-browser-contained
)
receipt baseline-keys python3 scripts/check-r6.py inventory "$R6_RUN/baseline-list.log"
receipt baseline-equals cmp "$BASE" "$R6_RUN/baseline-keys.log"
```

T001's `inventory` writes compact UTF-8 JSON lines in that order to stdout. At the intermediate W1 tree with only reporting/checker changes, before adding T002, record `git diff 6ee597e -- scripts/run-contained.sh scripts/check-r6.py` against the tracked instrumented tree and its commit SHA (include any new file). Run the separately labelled instrumented baseline. Then run the journey using the completed W1 tree and record its SHA and reviewed instrumentation diff separately. This keeps the predecessor receipt intact and costs only a separately named instrumented run, without backporting a reporter to the historical runner.

```bash
gate instrumented make test-browser-contained
receipt instrumented-check python3 scripts/check-r6.py full "$BASE" baseline "$R6_RUN/instrumented.files"
# At the completed W1 tree:
gate journey make test-browser-contained
receipt journey-check python3 scripts/check-r6.py full "$BASE" journey "$R6_RUN/journey.files"
receipt w1-policy python3 scripts/check-r6.py policy inherited .
```

`full` reads `full.list.json` and `full.json` from the named directory. Verify the selected keys in **both**, all expected attempts, global errors, SC-001 trial stdout and SC-002 inline timing attachments. In baseline/early journey mode allow exactly the two disabled-build signup skips, all 12 ageing keys must pass. Journey mode also requires the new matrix. With a copy of a real report, remove one timing cell and require this same checker to fail; preserve inputs, commands and exits.

## Plain CI and fixture accounting

The allowed delta from the baseline is exactly **12 additions**: file `tests/e2e/m1-journey.spec.cjs`, no named describe, leaf `Capture and find at WIDTHpx in THEME`, for 390/810/1440, light/dark and chromium/webkit. No removals or renames. Expected final union = 338. Define the 72 screenshot/overflow keys independently as those 12 cells × `folders,list,saved-editor,search-result,opened-result,restored-results`. Each cell has route, measured client/scroll widths, scrollX and a nonempty `journey/<project>-<width>-<theme>-<state>.png`. A passing selector must never define its own expected set.

| Input | Selector and standard files saved on success and failure |
|---|---|
| Full | Built default/off, `CONTAINED_TEST=1`, both projects, all ordinary specs except registration-enabled after T004; all ageing cases. `full.list.json`, `full.json`. |
| Plain | Built default/off, no `CONTAINED_TEST` in the browser, production cron. Same ordinary selection, exclude only `@ageing` on approval; on waiver select all 12 and observe their skips. `plain.list.json`, `plain.json`. Hosted default uses this same selection. |
| Signup | `VITE_SIGNUP_ENABLED=true` → only `tests/e2e/registration-enabled.spec.cjs`; signup-disabled runs `tests/e2e/registration.spec.cjs` on the off build. Both projects. `signup.list.json`, `signup.json` and `signup-disabled.list.json`, `signup-disabled.json`. Hosted enabled step retains its Vite frontend. |
| Recover | Built, contained, both engines, both entire files `tests/e2e/note-actions.spec.cjs` and `tests/e2e/recently-deleted.spec.cjs`; require all their baseline keys including the fixed 12. `recover.list.json`, `recover.json`. |
| Other profiles | Resilience selects save-resilience `@sc003` → `sc003.json`; search selects search + search-timing → `sc004.json`; performance uses `playwright.performance.config.ts` → `performance/index.html`; screenshots runs `tests/screenshots/capture.cjs` → `screenshots/`. |

Create the list with the **same config, environment, file filters and grep** as execution, adding `--list --reporter=json`. Save the named JSON execution report independently. Preserve partial reports/logs on failure; missing or unreadable evidence fails the check. T004 arranges always-upload of ordinary plain and enabled signup pairs on hosted CI under `ci-artifacts/{plain,signup}/` even if an earlier step fails. T005 adds the recover pair on approval. W3a implements this archive layout before the fork so a waiver requires no workflow edits. Download and inspect the actual archives.

The fixed ageing keys belong to `tests/e2e/recently-deleted.spec.cjs`, ancestor `Folder recovery at WIDTHpx`, and the two exact leaves `fresh decision after 409, authoritative 410 and elapsed deadline` and `restore held command receives genuine 404 after a competing removal`. Both engines × three widths = 12. The folder-removal sibling remains plain. Signup has exactly the baseline's two `enabled signup stays pending and retries verification without recreating the account` keys, no named ancestors. Freeze the owner decision in `ageing-decision.txt` with **approved** or **waived** on line one, then owner, date and reason.

```bash
MODE=$(head -1 "$R6_OUT/ageing-decision.txt")
receipt declared python3 scripts/check-r6.py policy "$MODE" .
receipt compare python3 scripts/check-r6.py compare "$BASE" "$MODE" "$R6_RUN/full.files" "$R6_RUN/plain.files" "$R6_RUN/signup.files" "$R6_RUN/recover.files"
```

`compare` takes directories in that order and opens **both** standard files in each. Reject missing, unexpected, duplicate or mismatched keys, global errors, unexpected statuses, skipped/pending attempts, repeated attempts or nonzero retry index. For the named waiver skips only, require actual skipped results. Require a single expected first-attempt pass for every other selected key. Full ∪ plain ∪ signup (both discovery and actual keyed outcomes) must equal the independent baseline plus the enumerated changes. Full = expected minus signup. Signup is exclusive and passes both keys on the enabled build. On approval plain = full minus ageing. On waiver plain selects full, passes full minus ageing and skips exactly ageing. In **both** branches local full and recover must pass the 12 actual ageing keys. Hosted plain/signup obey the same checks in both branches; on approval require all 12 actual passes in hosted recover too. On waiver retain the 12 hosted skips and local recover proof next to the signed decision.

`policy` is a failing declared-policy check, separate from attempt validation. Inspect test declarations (including describe/configure and test-level overrides), Playwright configs and all launcher commands in tests, scripts, package.json and CI. Compare suppression sites/conditions and retry settings to the approved list. Inherited allows only the two existing conditional ageing sites and one registration guard; after T004 registration has none. The W3a command `policy transition .` permits the two inherited ageing guards after T004. Waived allows only the two ageing guards with their original conditions; approved allows none. Reject focused/expected-failure/fixme/other skip declarations and positive or unresolved retry overrides even on first-attempt passes. Application Retry buttons, service-health retries, polling and protected fixture guards are distinct. Check MFA audit 5 separately on intended on/off configurations. A text inventory whose two outcomes both exit zero is insufficient.

Run three negative controls on copies, leaving originals intact; use the same checker invocations above. Preserve mutated inputs/diff, exact commands, numeric **nonzero** exits and rejected key/site under `$R6_RUN/negatives/{ordinary,ageing,retry}/`. An unexpected zero stops the wave.

1. Remove the chromium key `tests/e2e/admin-shortcut.spec.cjs` → `ordinary accounts never see the admin shortcut` from discovery **and** results of both full and plain, retaining its multi-case file and all other cases. Compare must report the missing baseline key.
2. Remove the webkit, 810px `restore held command receives genuine 404 after a competing removal` key from otherwise-green recover results (and its list, for the stronger check). Compare must reject it. Repeat against the downloaded hosted recover pair when approved; use actual local recover in the waiver branch.
3. On a verification copy, declare a positive retry setting for one previously first-attempt-green test. Keep its passing first attempt; the separate policy command must reject the declaration.

## Three full runs and ten recovery runs

Use one clean W6 SHA. Run `MODE=$(head -1 "$R6_OUT/ageing-decision.txt")`. The runner allows 29 minutes plus one minute for cleanup per invocation. Each full round uses default API, default browser and signup, with three empty cleanup inventories per invocation. Stop at the first red; a candidate repair resets both consecutive series.

```bash
test -z "$(git status --porcelain --untracked-files=normal)"
test "$(git rev-parse HEAD)" = "$R6_SHA"
receipt declared python3 scripts/check-r6.py policy "$MODE" .
gate plain env CONTAINED_PROFILE=plain make test-browser-contained
gate recover env CONTAINED_PROFILE=recover make test-browser-contained
for round in 1 2 3; do
  gate "full-$round-api" make test-api-contained
  gate "full-$round-browser" make test-browser-contained
  gate "full-$round-signup" env CONTAINED_PROFILE=signup make test-browser-contained
  receipt "compare-$round" python3 scripts/check-r6.py compare "$BASE" "$MODE" "$R6_RUN/full-$round-browser.files" "$R6_RUN/plain.files" "$R6_RUN/full-$round-signup.files" "$R6_RUN/recover.files"
done
for round in {1..10}; do
  gate "recovery-$round" env CONTAINED_PROFILE=resilience make test-browser-contained
  receipt "sc003-$round" python3 scripts/check-sc003.py "$R6_RUN/recovery-$round.files/sc003.json"
done
gate operator env CONTAINED_PROFILE=operator make test-browser-contained
gate accounts env CONTAINED_PROFILE=accounts make test-api-contained
gate restore env CONTAINED_PROFILE=restore make test-api-contained
gate search env CONTAINED_PROFILE=search make test-browser-contained
receipt sc004 python3 scripts/check-sc004.py "$R6_RUN/search.files/sc004.json"
gate performance env CONTAINED_PROFILE=performance make test-browser-contained
gate captures scripts/capture-screenshots.sh
```

`compare` includes the W1 full metrics/journey checks with the final selection. Store actual per-cell samples or raw-report pointers in `$R6_OUT/measurements.tsv` (criterion, round, engine, width, trial, measured value, threshold, result). Complete T012's visual review before recording the verified identity with `printf '%s\n' "$R6_SHA" > "$R6_OUT/w6.sha"` and `printf '%s\n' "$R6_RUN" > "$R6_OUT/w6-attempt.txt"`.

| Check | Numbers that must be reported |
|---|---|
| SC-001 | Actual tap-to-input and dispatch ms, exact-once hit/miss and hits/20 for each engine at 390. Threshold ≥19/20, input ≤1000 ms, one focused input, one character. R2 reference: 20/20 on both engines. |
| SC-002 | Each engine × width: actual pauseMs (healthy), delayMs ≥3000, pending/no stale Saved across a second edit, failure pauseMs and retryMs in [0,1000]. Healthy pause also ≤1000. Extract “SC-002 healthy” from note-recovery-controls and “SC-002 failure” / “SC-002 delayed response” from save-resilience. R3 healthy pause 506.9–512 ms, response hold 3358–3394.6 ms and failure-to-Retry 2.0–4.3 ms are comparisons only. |
| SC-003 | Five named cases × three widths × two engines = 30 unique passing first attempts per round, 300 total. Attach all ten JSON checks and zero independent server count/body/revision violations. The existing profile runs **one** round per invocation. |
| SC-004 | For each of six cells report all 20 ms values, correct IDs/highlighted terms out of 20, count strictly under 2000 ms, min/median/max. Require 100 active in five folders of 20, all results correct, ≥19 fast per cell. API confirms zero B/guest/deleted matches. R4 reference: 20/20 fast in all six, observed maximum 161.7 ms. |


## Candidate tree before dispatch

After T013 and the T014 documentation commit, compare the complete clean tracked trees, including additions, deletes, modes and renames. Inspect the contents of the allowed diff as well.

```bash
W6_SHA=$(cat "$R6_OUT/w6.sha")
test -z "$(git status --porcelain)"
receipt w7-paths git diff --no-renames --name-only "$W6_SHA" HEAD --
receipt w7-allowlist python3 -c '
import sys
allowed={"specs/002-notes-redesign/r6-gate/coverage.md","specs/002-notes-redesign/r6-gate/tasks.md","docs/testing/verification.md","docs/ci/checks-and-rules.md","CHANGELOG.md"}
extra=set(open(sys.argv[1]).read().splitlines())-allowed
if extra: sys.exit("Outside W7 docs: "+repr(sorted(extra)))' "$R6_RUN/w7-paths.log"
receipt w7-tree git diff --no-renames "$W6_SHA" HEAD --
```

Outside the allowlist, stop and report the diff. Coordinator classifies changed inputs, commissions affected proofs (including fresh phone/timing if the tested experience changed) and pins replacement W6 evidence before continuing. Keep the old series.

## Hosted CI before the PR

Local component proofs use separate capped stacks. Accounts exercises seed, operator exercises deployment accounts through a loopback mail proxy, restore starts its contained clone, and plain covers built-app selection. Hosted E2E exercises the ordinary built app, then the single ordered `bun run test:accounts` (seed, deployment accounts, **Docker clone restore**), then enabled registration on a separate Vite frontend with an explicit MFA audit. Only the hosted run proves that sequence. No new host port or Docker socket for local crews.

After T014's five-doc comparison and final shared checks, the coordinator pushes the immutable integrated `r6-gate` branch. The existing `.github/workflows/ci.yml` has `workflow_dispatch` on the default branch; no new trigger task. Before opening the PR, the coordinator runs:

```bash
HEAD_SHA=$(git rev-parse HEAD)
test "$(git ls-remote origin refs/heads/r6-gate | cut -f1)" = "$HEAD_SHA"
receipt dispatch gh workflow run ci.yml --ref r6-gate
gh run list --workflow ci.yml --event workflow_dispatch --branch r6-gate --commit "$HEAD_SHA" --json databaseId,headSha,event,createdAt,url
```

Use the run ID returned by dispatch or match that dispatch time/event/branch/SHA unambiguously. Set `RUN_ID` to that ID. Preserve evidence even if watch reports red:

```bash
status=0
receipt dispatch-watch gh run watch "$RUN_ID" --exit-status || status=$?
receipt dispatch-data gh run view "$RUN_ID" --json event,headBranch,headSha,url,jobs,conclusion
cp "$R6_RUN/dispatch-data.log" "$R6_OUT/ci/dispatch.json"
mkdir -p "$R6_OUT/ci/runs/$RUN_ID"
cp "$R6_RUN/dispatch-data.log" "$R6_OUT/ci/runs/$RUN_ID/jobs.json"
receipt dispatch-archives gh run download "$RUN_ID" --dir "$R6_OUT/ci/runs/$RUN_ID/artifacts"
test "$status" = 0
```

Require the resolved SHA = final head, event = workflow_dispatch, branch = r6-gate, and all required jobs successful: **Quality**, **Docs links**, **Workflow lint**, **E2E (amd64)** and **Recover (amd64)** when approved. Verify the ordered steps and exits. Set `HOSTED` to the downloaded `test-results-amd64/ci-artifacts` directory and `W6_RUN=$(cat "$R6_OUT/w6-attempt.txt")`. For approval use the downloaded `recover-amd64/recover` directory for `RECOVER`; for waiver use `$W6_RUN/recover.files`. Run `receipt hosted-compare python3 scripts/check-r6.py compare "$BASE" "$MODE" "$W6_RUN/full-3-browser.files" "$HOSTED/plain" "$HOSTED/signup" "$RECOVER"`. Retain the per-run archives and timing receipts on failures as well. Record the declaration check independently on the clean final checkout. Write per-job and per-step start, completion, elapsed seconds, conclusion and the containing job URL from the jobs JSON to `$R6_OUT/ci/dispatch-timing.tsv`. Measure each timed job from startedAt to completedAt including browser install and uploads; exclude queue time. The E2E and optional recover job each must finish green within 2,400 seconds. Prior E2E durations were 17m58s and 34m38s, with 22m35s spent installing browsers in the slower run. On timeout/overrun stop before PR, preserve timings, have the coordinator authorize a bounded workflow change moving independent checks to a parallel job. Re-run on the new frozen candidate; retain all cases, zero retries and the same cap.

On the authorized PR, record the PR head, actual tested merge-ref SHA, run ID/job URLs, conclusions and durations in `ci/pr.json` and the PR body. Use the run's check-suite/checkout evidence to distinguish merge SHA from PR head. Record the owner's sign-off against that immutable candidate externally. A head or merge-base change requires fresh applicable checks.

## Visual evidence

T002 saves full-width evidence for Folders, ordinary list, saved editor, body-search result, opened result and restored results. Require 6 states × 2 engines × 3 widths × 2 appearances = 72 images. Check `document.documentElement.scrollWidth <= document.documentElement.clientWidth` and `scrollX === 0` at each state, plus exactly one visible main region on phone. Compare visible controls, clipping, legibility and focus on a contact sheet, inspect each suspect original at 1:1, record reviewer and result per cell. Use the fresh R5 recover and R4 search profiles for their own action/search states. A snapshot without the associated live journey does not prove the gate.

Extend **one** recording in `tests/screenshots/capture.cjs`: start with its existing Compose → type → Saved → Back → reopen sequence, add body-search/open/Back and move; port ALL recovery beats from the local artifact `reports/r5-w5b-trash-ui-evidence/main-flow.spec.cjs` (compare to main-flow.webm): Field notes, Spring planting, actual delete confirmation, trash, restore, restored announcement and row, folder confirmation/count, confirm deletion, All Notes/search focus, verify detached/tombstoned ID via API. Preserve the prior seed/open fixtures or explicitly create them through the UI/API. Append any visible correction of a confirmed major R6 defect. Use named Save status and assertions between actions. Preserve the core-loop.webm, rendered GIF and mobile.png outputs for existing callers. Inspect playback from first Compose to final focus in the accepted candidate.

Keep complete synthetic captures under the evidence directory. For the README, derive compact screenshots from the contained originals; run in the evidence directory with R6_SRC set to the captures directory. The R2 originals measured 45,621 and 31,814 bytes with this exact command. Measure the actual outputs **before checkout writeback**. Copy only the two current JPEGs once W5c's entire size fits.

```bash
R6_SRC="$R6_RUN/screens.files/screenshots"  # use the accepted W5b attempt, or captures.files in W6
for name in notebook-light mobile; do
  ffmpeg -v error -i "$R6_SRC/$name.png" -vf scale=960:-2 -frames:v 1 -c:v mjpeg -q:v 5 "$R6_RUN/m1-$name.jpg"
done
wc -c "$R6_RUN"/m1-*.jpg
```

For **every evidence task**, record the previous script plus R6 steps, previous release comparison and chosen images. Compare SHA-256 of each candidate against *all* files under releases/R5; exclude byte-identical files regardless of name. A different hash can reflect cursor/time/seed text; compare like states visually and exclude those differences too. Inspect prior releases for already-shipped screens absent from the sparse R5 folder. Write `$R6_OUT/visual/manifest.tsv` with candidate SHA, source file, engine, width, theme, state, measured overflow, focus/visible-state verdict, reviewer/date, SHA-256, R5 or older comparator path/hash, keep/drop and reason. Include the recording as its own row. After merge the coordinator adds only genuinely new/changed screens and a cumulative recording only if its visible content changed to `~/.local/share/agent-artifacts/pocketbase-notes-app/releases/R6/`, updates the releases README row and uses the same selection on the progress page. Raw gate captures, contact sheets, README derivatives and the full R6 suite remain retrievable separately. Enter the WebM in the same manifest. Compare hash and visible sequence against R5 and corresponding older recordings. Drop a byte match or a visually unchanged recording even when encoding, cursor, time or seed text differs. Keep the complete raw recording in the attempt directory. Record zero selected files if nothing visibly changed. Earlier releases stay intact.
