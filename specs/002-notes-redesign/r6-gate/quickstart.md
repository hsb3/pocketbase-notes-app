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
| `ci/dispatch.json`, `ci/runs/<id>/attempt.*/artifacts/`, `ci/pr.json`, `signoff.md` | Tested SHAs and hosted receipts, final head, merge ref, run/job URLs, individual decisions and owner sign-off. Put updated identities in the PR and external ledger. |

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

`full` reads `full.list.json` and `full.json` from the named directory. Verify the selected keys in **both**, all expected attempts, global errors, SC-001 trial stdout and SC-002 inline timing attachments. In baseline/early journey mode allow exactly the two disabled-build signup skips, all 12 ageing keys must pass. Journey mode also requires the new matrix. Exercise the missing timing cell using the negative-control pattern below.

## Plain CI and fixture accounting

The allowed delta from the baseline is exactly **12 additions**: file `tests/e2e/m1-journey.spec.cjs`, no named describe, leaf `Capture and find at WIDTHpx in THEME`, for 390/810/1440, light/dark and chromium/webkit. No removals or renames. Expected final union = 338. Define the 72 screenshot/overflow keys independently as those 12 cells × `folders,list,saved-editor,search-result,opened-result,restored-results`. Each cell has route, measured client/scroll widths, scrollX and a nonempty `journey/<project>-<width>-<theme>-<state>.png`. A passing selector must never define its own expected set.

| Input | Selector and standard files saved on success and failure |
|---|---|
| Full | Built default/off, `CONTAINED_TEST=1`, both projects, all ordinary specs except registration-enabled after T004; all ageing cases. `full.list.json`, `full.json`. |
| Plain | Built default/off, no `CONTAINED_TEST` in the browser, production cron. Same ordinary selection, exclude only `@ageing`. `plain.list.json`, `plain.json`. Hosted default uses this same selection. |
| Signup | `VITE_SIGNUP_ENABLED=true` → only `tests/e2e/registration-enabled.spec.cjs`; signup-disabled runs `tests/e2e/registration.spec.cjs` on the off build. Both projects. `signup.list.json`, `signup.json` and `signup-disabled.list.json`, `signup-disabled.json`. Hosted enabled step retains its Vite frontend. |
| Recover | Built, contained, both engines, both entire files `tests/e2e/note-actions.spec.cjs` and `tests/e2e/recently-deleted.spec.cjs`; require all their baseline keys including the fixed 12. `recover.list.json`, `recover.json`. |
| Other profiles | Resilience selects save-resilience `@sc003` → `sc003.json`; search selects search + search-timing → `sc004.json`; performance uses `playwright.performance.config.ts` → `performance/index.html`; screenshots runs `tests/screenshots/capture.cjs` → `screenshots/`. |

Create the list with the **same config, environment, file filters and grep** as execution, adding `--list --reporter=json`. Save the named JSON execution report independently. Preserve partial reports/logs on failure; missing or unreadable evidence fails the check. T004 arranges always-upload of ordinary plain and enabled signup pairs on hosted CI under `ci-artifacts/{plain,signup}/` even if an earlier step fails. T005 adds the recover pair. Download and inspect the actual archives.

The fixed ageing keys belong to `tests/e2e/recently-deleted.spec.cjs`, ancestor `Folder recovery at WIDTHpx`, and the two exact leaves `fresh decision after 409, authoritative 410 and elapsed deadline` and `restore held command receives genuine 404 after a competing removal`. Both engines × three widths = 12. The folder-removal sibling remains plain. Signup has exactly the baseline's two `enabled signup stays pending and retries verification without recreating the account` keys, no named ancestors.

```bash
receipt declared python3 scripts/check-r6.py policy final .
receipt compare python3 scripts/check-r6.py compare "$BASE" "$R6_RUN/full.files" "$R6_RUN/plain.files" "$R6_RUN/signup.files" "$R6_RUN/recover.files"
```

`compare` checks both standard files in each directory. Discovery and actual results must each equal the independent expected keys. Full has 336 (baseline + journey minus signup), plain has 324 (full minus ageing), signup has two and recover has 122 (both entire files). Full ∪ plain ∪ signup has 338. Reject missing, unexpected or duplicate keys, global errors, skipped/pending tests, repeated attempts and nonzero retry indices. Each selected case passes on its first attempt. Require all 12 ageing passes in full and recover and both enabled-signup passes. T014 substitutes each hosted run’s actual plain, signup and recover pairs.

`policy` checks declarations independently of actual attempts. Limit it to test/test.describe annotations and retry configuration in the selected `tests/e2e/*.spec.cjs` and `tests/performance/editor.spec.cjs`, project/config retries in `playwright.config.ts` and `playwright.performance.config.ts`, and the Playwright selections/flags in `scripts/run-contained.sh`, `package.json`’s `test:e2e` and `test:performance` commands and the E2E/recover steps in `.github/workflows/ci.yml`. Inherited permits only the two existing conditional ageing skips and one registration guard. W3a uses `policy transition .` for the two ageing guards. Final permits none. Reject focused, expected-failure, fixme and additional skip declarations, positive retries, or an unrecognized override on these paths. Name the file and declaration for coordinator review. Preserve fixture guards, application Retry, health checks and the separate MFA audit.

**Negative controls.** Start with a passing check. Copy only the inputs being mutated into the named directory under `$R6_RUN/negatives`. Keep originals read-only. Use the following helper in each wave after [evidence setup](#evidence-setup) (in the standalone T014 shell, set `R6_RUN=$run` first). Each unique receipt must contain the checker’s diagnostic and numeric nonzero exit. A duplicate receipt, missing diagnostic or unexpected pass fails the wave.

```bash
expect_rejection() {
  local dir="$NEG/$1" diagnostic=$2 status=0
  shift 2
  mkdir -p "$dir"
  test ! -e "$dir/check.command" || return 2
  printf '%q ' python3 scripts/check-r6.py "$@" > "$dir/check.command"
  if python3 scripts/check-r6.py "$@" > "$dir/check.log" 2>&1; then
    echo "Unexpected pass: $dir" >&2
  else
    status=$?
  fi
  printf '%s\n' "$status" > "$dir/check.exit"
  (( status != 0 )) && grep -F -- "$diagnostic" "$dir/check.log"
}
NEG="$R6_RUN/negatives"
mkdir -p "$NEG"/{timing,ordinary,ageing,retry}
```

| Wave / copied input and mutation | Command after mutation (diagnostic identifies the rejected cell, key or declaration) |
|---|---|
| W1: copy `journey.files` to `$NEG/timing/full`. Remove only the `SC-002 healthy` timing attachment for chromium at 390px from `full.json`. | `expect_rejection timing 'SC-002 healthy chromium 390' full "$BASE" journey "$NEG/timing/full"` |
| W3b: copy `full.files` and `plain.files` to `$NEG/ordinary/full` and `$NEG/ordinary/plain`. In all four list/result files remove just the chromium key for `tests/e2e/admin-shortcut.spec.cjs` / `ordinary accounts never see the admin shortcut`. | `expect_rejection ordinary 'ordinary accounts never see the admin shortcut' compare "$BASE" "$NEG/ordinary/full" "$NEG/ordinary/plain" "$R6_RUN/signup.files" "$R6_RUN/recover.files"` |
| W3b: copy `recover.files` to `$NEG/ageing/recover`. In both files remove only the webkit / Folder recovery at 810px / `restore held command receives genuine 404 after a competing removal` key. | `expect_rejection ageing 'restore held command receives genuine 404 after a competing removal' compare "$BASE" "$R6_RUN/full.files" "$R6_RUN/plain.files" "$R6_RUN/signup.files" "$NEG/ageing/recover"` |
| W3b: export the clean tested checkout to `$NEG/retry/tree`. Set `retries: 1` in its `playwright.config.ts`, keeping the first-attempt-green report intact. | `expect_rejection retry 'retries: 1' policy final "$NEG/retry/tree"` |

Require the full diagnostic to identify the exact engine/width/key or retry declaration and value even where the command matches a substring. T014 repeats the ageing control on a copy of the dispatch recover archive under `$NEG/hosted-ageing/recover`, with the same single-key mutation. Run `expect_rejection hosted-ageing 'restore held command receives genuine 404 after a competing removal' compare "$BASE" "$W6_RUN/full-3-browser.files" "$HOSTED/plain" "$HOSTED/signup" "$NEG/hosted-ageing/recover"`. Preserve the passing originals, mutations, logs and exits.

## Three full runs and ten recovery runs

Use one clean W6 SHA. The runner allows 29 minutes plus one minute for cleanup per invocation. Each full round uses default API, default browser and signup, with three empty cleanup inventories per invocation. Stop at the first red; a candidate repair resets both consecutive series.

```bash
test -z "$(git status --porcelain --untracked-files=normal)"
test "$(git rev-parse HEAD)" = "$R6_SHA"
receipt declared python3 scripts/check-r6.py policy final .
gate plain env CONTAINED_PROFILE=plain make test-browser-contained
gate recover env CONTAINED_PROFILE=recover make test-browser-contained
for round in 1 2 3; do
  gate "full-$round-api" make test-api-contained
  gate "full-$round-browser" make test-browser-contained
  gate "full-$round-signup" env CONTAINED_PROFILE=signup make test-browser-contained
  receipt "compare-$round" python3 scripts/check-r6.py compare "$BASE" "$R6_RUN/full-$round-browser.files" "$R6_RUN/plain.files" "$R6_RUN/full-$round-signup.files" "$R6_RUN/recover.files"
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
set -euo pipefail
HEAD_SHA=$(git rev-parse HEAD)
test "$(git ls-remote origin refs/heads/r6-gate | cut -f1)" = "$HEAD_SHA"
gh workflow run ci.yml --ref r6-gate
gh run list --workflow ci.yml --event workflow_dispatch --branch r6-gate --commit "$HEAD_SHA" --json databaseId,headSha,event,createdAt,url
```

Select the exact event, dispatch time, branch and SHA. For the authorized PR, obtain the actual tested merge SHA from the run’s checkout log (`gh run view RUN_ID --log`, checkout’s final `git log -1`), corroborate the PR head and run ID, and retain the checkout evidence. Make that commit available locally from the PR merge ref. Compare the entire tested tree with the accepted head (`git diff ACCEPTED_HEAD TESTED_MERGE --`). Apply the [changed-input procedure](#candidate-tree-before-dispatch) to any material runtime, test, configuration or workflow difference before accepting that PR proof. A moved head or merge base needs fresh applicable evidence.

Run the same block from a **fresh Bash shell at the accepted integrated head** for each event. Enter `dispatch` or `pr`, the run ID and the verified checkout SHA. Each run has its own archives, timings and checker receipt. The comparison uses the accepted local full report and all three actual hosted pairs. A failed watch or download still leaves all available evidence.

```bash
set -euo pipefail
umask 077
read -r -p 'R6 evidence folder: ' R6_OUT
read -r -p 'Event (dispatch or pr): ' kind
read -r -p 'Verified run ID: ' RUN_ID
read -r -p 'Tested checkout SHA: ' tested
[[ $kind =~ ^(dispatch|pr)$ && $RUN_ID =~ ^[0-9]+$ && $tested =~ ^[0-9a-f]{40}$ ]]
BASE=specs/002-notes-redesign/r6-gate/baseline-6ee597e.jsonl
head_sha=$(git rev-parse HEAD)
W6_RUN=$(cat "$R6_OUT/w6-attempt.txt")
test "$(cat "$W6_RUN/commit.txt")" = "$(cat "$R6_OUT/w6.sha")"
out="$R6_OUT/ci/runs/$RUN_ID"
mkdir -p "$out"
run=$(mktemp -d "$out/attempt.XXXXXXXX")
HOSTED="$run/artifacts/test-results-amd64/ci-artifacts"
RECOVER="$run/artifacts/recover-amd64/recover"

watch=0 data=0 timing=0 archive=0 compare=0
gh run watch "$RUN_ID" --exit-status > "$run/watch.log" 2>&1 || watch=$?
gh run view "$RUN_ID" --json databaseId,event,headBranch,headSha,url,jobs,conclusion > "$run/jobs.json" 2>"$run/jobs.err" || data=$?
jq -r 'def row($url): [.name,.startedAt,.completedAt,
  (try ((.completedAt|fromdateiso8601)-(.startedAt|fromdateiso8601)) catch null),
  .conclusion,$url] | @tsv;
  .jobs[] | .url as $u | row($u), (.steps[] | row($u))' "$run/jobs.json" > "$run/timing.tsv" || timing=$?
gh run download "$RUN_ID" --dir "$run/artifacts" > "$run/archive.log" 2>&1 || archive=$?
cmd=(python3 scripts/check-r6.py compare "$BASE" "$W6_RUN/full-3-browser.files" "$HOSTED/plain" "$HOSTED/signup" "$RECOVER")
printf '%q ' "${cmd[@]}" > "$run/compare.command"
"${cmd[@]}" > "$run/compare.log" 2>&1 || compare=$?
jq -n --arg head "$head_sha" --arg tested "$tested" --arg receipts "$run" --argjson id "$RUN_ID" \
  --rawfile jobs "$run/jobs.json" --rawfile durations "$run/timing.tsv" --argjson watch "$watch" --argjson data "$data" --argjson timing "$timing" --argjson archive "$archive" --argjson cmp "$compare" \
  '{headSha:$head,testedSha:$tested,runId:$id,run:((try ($jobs|fromjson) catch null)),timings:$durations,receipts:$receipts,watchExit:$watch,jobsExit:$data,timingExit:$timing,archiveExit:$archive,compareExit:$cmp}' \
  > "$run/result.json"
cp "$run/result.json" "$R6_OUT/ci/$kind.json"
for status in "$watch" "$data" "$timing" "$archive" "$compare"; do
  (( status == 0 )) || exit "$status"
done
```

Check `jobs.json` and the checkout log against the entered identities. Dispatch must be `workflow_dispatch` on `r6-gate` at the accepted head. The PR must be `pull_request` for the accepted PR head with the recorded tested merge SHA. Require green **Quality**, **Docs links**, **Workflow lint**, **E2E (amd64)** and **Recover (amd64)**, the ordered steps and passing inventory comparison. Run the separate declaration check on the clean final checkout. In `timing.tsv` require **each** E2E and recover job to finish within 2,400 seconds from job start to completion, including installation and upload, excluding queue time. Historical E2E jobs took 17m58s and 34m38s, including a 22m35s browser install in the slower run. On timeout, preserve receipts and stop for coordinator-authorized reslicing of independent checks. Rerun with the same cases, zero retries and the same per-job cap. For dispatch, also apply the [hosted recover negative](#plain-ci-and-fixture-accounting) against the downloaded originals. For the PR, include both SHAs, run/job URLs, conclusions, durations and comparison exit in the PR and link the receipts from `ci/pr.json`. Sign-off uses that verified identity.

## Visual evidence

T002 saves full-width evidence for Folders, ordinary list, saved editor, body-search result, opened result and restored results. Require 6 states × 2 engines × 3 widths × 2 appearances = 72 images. Check `document.documentElement.scrollWidth <= document.documentElement.clientWidth` and `scrollX === 0` at each state, plus exactly one visible main region on phone. Compare visible controls, clipping, legibility and focus on a contact sheet, inspect each suspect original at 1:1, record reviewer and result per cell. Use the fresh R5 recover and R4 search profiles for their own action/search states. A snapshot without the associated live journey does not prove the gate.

Extend **one** recording in `tests/screenshots/capture.cjs`: start with its existing Compose → type → Saved → Back → reopen sequence, add body-search/open/Back and move; port ALL recovery beats from the local artifact `reports/r5-w5b-trash-ui-evidence/main-flow.spec.cjs` (compare to main-flow.webm): Field notes, Spring planting, actual delete confirmation, trash, restore, restored announcement and row, folder confirmation/count, confirm deletion, All Notes/search focus, verify detached/tombstoned ID via API. Preserve the prior seed/open fixtures or explicitly create them through the UI/API. Append any visible correction of a confirmed major R6 defect. Use named Save status and assertions between actions. Preserve the core-loop.webm, rendered GIF and mobile.png outputs for existing callers. Inspect playback from first Compose to final focus in the accepted candidate.

Keep complete synthetic captures under the evidence directory. W5c receives the **accepted W5b attempt’s absolute path** from the coordinator. Draft the final `README.md` in the W5c attempt and run this block there before copying any of the three files into the checkout. Start at JPEG q=5. If over budget, rerun at q=7, inspect legibility at 1:1 and remeasure. If still over or unreadable, stop for reslicing.

```bash
read -r -p 'Accepted W5b attempt directory: ' W5B_RUN
test -d "$W5B_RUN/screens.files/screenshots"
R6_SRC="$W5B_RUN/screens.files/screenshots"
quality=5
for name in notebook-light mobile; do
  ffmpeg -y -v error -i "$R6_SRC/$name.png" -vf scale=960:-2 -frames:v 1 -c:v mjpeg -q:v "$quality" "$R6_RUN/m1-$name.jpg"
done
wc -c "$R6_RUN"/{README.md,m1-notebook-light.jpg,m1-mobile.jpg} | awk '{print} END {exit !($2 == "total" && $1 <= 92000)}'
```

For **every evidence task**, record the previous script plus R6 steps, previous release comparison and chosen images. Compare SHA-256 of each candidate against *all* files under releases/R5; exclude byte-identical files regardless of name. A different hash can reflect cursor/time/seed text; compare like states visually and exclude those differences too. Inspect prior releases for already-shipped screens absent from the sparse R5 folder. Write `$R6_OUT/visual/manifest.tsv` with candidate SHA, source file, engine, width, theme, state, measured overflow, focus/visible-state verdict, reviewer/date, SHA-256, R5 or older comparator path/hash, keep/drop and reason. Include the WebM as its own row and compare the visible sequence. After merge the coordinator adds only genuinely new/changed screens and a cumulative recording only if its visible content changed to `~/.local/share/agent-artifacts/pocketbase-notes-app/releases/R6/`, updates the releases README row and uses the same selection on the progress page. Raw gate captures, contact sheets, README derivatives and the full R6 suite remain retrievable separately. Record zero selected files if nothing visibly changed. Earlier releases stay intact.
