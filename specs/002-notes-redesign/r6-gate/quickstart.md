# Execute and record the R6 gate

Each wave starts from its assigned integrated predecessor. Run commands from the repository root in Bash with the existing frozen Bun dependencies, Docker and FFmpeg. Use an exact disposable candidate checkout for builds, generated files and test-results. The planning commit does not start a stack. [Runner prerequisites](../../../docs/testing/verification.md#disposable-docker-gates)

## Evidence setup

Use a new private directory per candidate series. Save synthetic data only. Browser JSON, traces and screenshots may contain fixture credentials. Keep raw artifacts local. Put sanitized numbers, hashes, project IDs, exits and the full coverage table in the PR. For a red test run, record both the base SHA and the test-only patch digest. Keep real files on failure, including the runner's cleanup checks.

```bash
set -euo pipefail
unset CONTAINED_PROFILE
umask 077
R6_SHA=$(git rev-parse HEAD)
R6_REPORTS="$HOME/.local/share/agent-artifacts/pocketbase-notes-app/reports"
mkdir -p "$R6_REPORTS"
R6_OUT=$(mktemp -d "$R6_REPORTS/r6-${R6_SHA:0:8}.XXXXXXXX")
git status --short > "$R6_OUT/worktree.txt"
printf '%s\n' "$R6_SHA" > "$R6_OUT/commit.txt"
gate() {
  local name=$1 status=0 project kind
  shift
  test ! -e "$R6_OUT/$name.log" || return 2
  printf '%q ' "$@" > "$R6_OUT/$name.command"
  "$@" > "$R6_OUT/$name.log" 2>&1 || status=$?
  printf '%s\t%s\n' "$name" "$status" >> "$R6_OUT/exits.tsv"
  project=$(sed -nE 's/^Contained [^ ]+ gate: (notes-test-[0-9a-f]+)$/\1/p' "$R6_OUT/$name.log")
  if [[ $project =~ ^notes-test-[0-9a-f]{24}$ ]]; then
    if [[ -d test-results/$project ]]; then cp -R "test-results/$project" "$R6_OUT/$name.files"; fi
    for kind in container network volume; do
      grep -Fx "cleanup $project $kind: empty" "$R6_OUT/$name.log" >/dev/null || status=1
    done
  else
    status=1
  fi
  printf '%s\t%s\t%s\n' "$name" "$project" "$status" >> "$R6_OUT/gates.tsv"
  tail -n 6 "$R6_OUT/$name.log"
  return "$status"
}
```

## Wave exits

Run the shared checks on each candidate (verification copy). For doc or root config changes include both docs checks. Store the terminal exits and candidate tree. Stop on unexpected writebacks. Compare generated files against the candidate with `git diff --exit-code`. Never hand-edit them.

```bash
bun test tests/unit
bun run lint
bun run knip
bun x tsc -p scripts/tsconfig.json
bun run build
python3 scripts/ai-context.py check
bun run docs:build
git diff --check
```

| Wave | Additional commands, using gate() above | Passing evidence |
|---|---|---|
| W1 measurement | Baseline on predecessor: `gate base-api make test-api-contained`, `gate base-browser make test-browser-contained`. After T002: `gate journey make test-browser-contained`, `gate search env CONTAINED_PROFILE=search make test-browser-contained`. | Preserve expected baseline configuration skips by name until W3. New journey passes both engines; report actual viewport/overflow and metrics. Fail on unexplained skips. |
| W2 privacy | `gate privacy make test-api-contained` | Matrix row/status/owner readbacks, and contained noteActions PASS. |
| W3a signup | `gate off make test-api-contained`, `gate on env CONTAINED_PROFILE=signup make test-browser-contained`, `gate off-ui env CONTAINED_PROFILE=signup-disabled make test-browser-contained`, `gate default make test-browser-contained` | Explicit off/403 and on/created-with-MFA-off, both browser configurations and no registration skips. |
| W3b fixture selection | `gate recover env CONTAINED_PROFILE=recover make test-browser-contained`, `gate plain env CONTAINED_PROFILE=plain make test-browser-contained`, `gate full make test-browser-contained`, `gate signup env CONTAINED_PROFILE=signup make test-browser-contained`; run `python3 scripts/check-r6.py compare "$R6_OUT/full.files/full.json" "$R6_OUT/plain.files/plain.json" "$R6_OUT/signup.files/signup.json" "$R6_OUT/recover.files/recover.json"`. | New plain profile uses capped services with the browser's CONTAINED_TEST unset and production scheduler. Compare selected cases as specified below. The baseline runner has no plain profile. |
| W4 timing race | `gate redirects env CONTAINED_PROFILE=plain make test-browser-contained` | Same non-default redirect survives MFA and page load in Chromium/WebKit on desktop and phone. |
| W5a guides | Shared checks plus inspect built sidebar, current notes/folders navigation and retained historical anchors. | Verified guides, root config inventory and routed docs links. |
| W5b capture script | `gate screens scripts/capture-screenshots.sh`, `gate perf env CONTAINED_PROFILE=performance make test-browser-contained` | Read the captured screens, play the cumulative WebM, verify GIF/phone strip and production editor smoke report. |
| W5c README | Use W5b's matched source captures, derive the two measured JPEGs below, run docs checks and view both at their README display size. | Readable current images and final whole-file sizes within cap. |
| W6 automated gate | Run the final series below from a clean, frozen candidate. | Independent numbers, exact matrix sets, CI parity, captions, hashes and defect list. |
| W7 sign-off | [Owner runbook](owner-check.md), final issue query and docs checks. After coordinator opens the single authorized PR: `gh pr checks --watch` (in its branch); identify exact tested SHA and amd64 run URL. | Every gate signed or explicitly pending, including individual owner decisions. The gate remains open until signed. |

## Three full runs and ten recovery runs

A full round covers `bun run test:e2e`'s API + both default browser engines via their contained equivalents. Include the separate enabled signup UI so its alternate build actually runs. The ordinary disabled signup UI is part of default. There is no standalone host browser. Each command has the runner's 29-minute timer plus one minute for teardown (≤90 minutes per three-command round, ≤300 minutes for ten resilience invocations). Stop the first failing series; preserve its directory. Any fix to the candidate resets both series. Record each final exit, discovered cases by engine/profile and any exclusions. No “rerun failed” substitution.

```bash
test -z "$(git status --porcelain --untracked-files=normal)"
test "$(git rev-parse HEAD)" = "$R6_SHA"
for round in 1 2 3; do
  gate "full-$round-api" make test-api-contained
  gate "full-$round-browser" make test-browser-contained
  gate "full-$round-signup" env CONTAINED_PROFILE=signup make test-browser-contained
done
for round in {1..10}; do
  gate "recovery-$round" env CONTAINED_PROFILE=resilience make test-browser-contained
  python3 scripts/check-sc003.py "$R6_OUT/recovery-$round.files/sc003.json"
done
gate plain env CONTAINED_PROFILE=plain make test-browser-contained
gate operator env CONTAINED_PROFILE=operator make test-browser-contained
gate accounts env CONTAINED_PROFILE=accounts make test-api-contained
gate restore env CONTAINED_PROFILE=restore make test-api-contained
gate search env CONTAINED_PROFILE=search make test-browser-contained
python3 scripts/check-sc004.py "$R6_OUT/search.files/sc004.json" > "$R6_OUT/sc004.txt"
gate recover env CONTAINED_PROFILE=recover make test-browser-contained
gate performance env CONTAINED_PROFILE=performance make test-browser-contained
gate captures scripts/capture-screenshots.sh
```

Like check-sc003.py, the T001 checker runs on the host after the runner copies the reports out and before reporting success, taking the full JSON and the same invocation’s discovery JSON. T005 adds the cross-profile comparison at W3b and W6. Retain reports under the filenames below and run from the repo root after the series:

```bash
python3 scripts/check-r6.py compare "$R6_OUT/full-3-browser.files/full.json" "$R6_OUT/plain.files/plain.json" "$R6_OUT/full-3-signup.files/signup.json" "$R6_OUT/recover.files/recover.json"
```

Use the full default JSON retained by T001 (`full.json`) for each browser run. The full.json reporter is new; the baseline default prints list output and discards the passing HTML report. Save the standard output per engine/trial for SC-001. Decode each SC-002 inline JSON attachment (Playwright JSON encodes its body in base64). Write actual per-cell results and hashes in `$R6_OUT/measurements.tsv` with one row per series, engine, width and criterion; include raw report and test title. Compare in the PR:

| Check | Numbers that must be reported |
|---|---|
| SC-001 | Actual tap-to-input and dispatch ms, exact-once hit/miss and hits/20 for each engine at 390. Threshold ≥19/20, input ≤1000 ms, one focused input, one character. R2 reference: 20/20 on both engines. |
| SC-002 | Each engine × width: actual pauseMs (healthy), delayMs ≥3000, pending/no stale Saved across a second edit, failure pauseMs and retryMs in [0,1000]. Healthy pause also ≤1000. Extract “SC-002 healthy” from note-recovery-controls and “SC-002 failure” / “SC-002 delayed response” from save-resilience. R3 healthy pause 506.9–512 ms, response hold 3358–3394.6 ms and failure-to-Retry 2.0–4.3 ms are comparisons only. |
| SC-003 | Five named cases × three widths × two engines = 30 unique passing first attempts per round, 300 total. Attach all ten JSON checks and zero independent server count/body/revision violations. The existing profile runs **one** round per invocation. |
| SC-004 | For each of six cells report all 20 ms values, correct IDs/highlighted terms out of 20, count strictly under 2000 ms, min/median/max. Require 100 active in five folders of 20, all results correct, ≥19 fast per cell. API confirms zero B/guest/deleted matches. R4 reference: 20/20 fast in all six, observed maximum 161.7 ms. |

## Plain CI and fixture accounting

Run at baseline and on the exact pre-PR tree:

```bash
rg -n 'test\.(skip|fixme|only|fail)|describe\.(skip|only|fixme)|\b(SKIP|FIXME)\b|--retries|retries:|CONTAINED_TEST' tests scripts playwright*.ts || test "$?" = 1
gh issue list --state open --limit 500 --json number,title,labels,url > "$R6_OUT/issues.json"
gh label list --limit 200 --json name > "$R6_OUT/labels.json"
```

At 6ee597e, Playwright discovery listed 163 cases per engine. There are two ageing guards at recently-deleted.spec.cjs:464,634. The second applies only to `kind === "restore"`; folder-removal siblings must still run plain. Two titles × three widths × two engines = 12 fixture-only cases. Enabled registration has a third test.skip site, one case per engine. No test.fixme or positive test retries found. Default config and focused runner specify zero retries. In test-mfa.ts the public-signup check treats HTTP 403 as SKIP even if signup was intended. Test helpers that press Retry, eventual status polling, and checkers rejecting nonzero retry counts exercise application behavior; keep them. `skipLibCheck`, traversal skip dirs and the invalid-search skipTotal operand do not suppress test cases. Other contained guards in test-notes, test-note-actions, test-attachments, test-r2-upgrade, test-storage-object, seed and restore protect real SQL, storage or local fixture work. Keep those guards and run their positive profiles.

Recommended approved-CI branch: label exactly the two ageing titles (conditional tag on the restore variant) and the enabled registration case. Select the right file/config for signup and exclude only the ageing tag on a plain stack; preserve the hard safety check inside age(). Do not set CONTAINED_TEST on hosted plain services. From the profile's actual Playwright test list and JSON, compare (file, full title including width, engine) sets: contained default minus plain = exactly the 12 expected ageing keys, plain minus contained = empty. Signup supplies exactly the two enabled-registration keys, exclusively. Enumerate the expected 12 from the two fixed names, widths and engines and check the set independently. Require no missing ordinary files, both engines, one passed attempt per selected key, no runtime skip/retry, and all 12 in hosted contained recover. Pre-PR plain executes the rest. CI retains Quality and the current E2E (amd64) 40-minute limit. Keep the generated full and plain discovery/report pairs beside each other, retain signup.json on both outcomes and check the actual JSON even for a zero command exit. Add a separate native Linux amd64 fixture job in parallel (40 minutes, contained invocation ≤30); do not add another browser install into the timed E2E job. Both jobs must pass on the PR SHA; do not change repository rulesets. Record job wall times. A CI timeout is a failure, not an accepted measurement.

Alternative only with explicit owner acceptance: keep the **two existing ageing guards** and their plain skips, still run all 12 locally in each full default plus recover, and list both titles × all cells with the scheduler/SQL constraint, CI scope and written waiver in the PR. Do not claim zero skips. Plain must *execute and report* these exact skips in this branch, with zero additional skips; reconcile passed sets and skip sets separately. Signup and MFA work is unconditional in either branch.

## Visual evidence

T002 saves full-width evidence for Folders, ordinary list, saved editor, body-search result, opened result and restored results. Require 6 states × 2 engines × 3 widths × 2 appearances = 72 images. Check `document.documentElement.scrollWidth <= document.documentElement.clientWidth` and `scrollX === 0` at each state, plus exactly one visible main region on phone. Compare visible controls, clipping, legibility and focus on a contact sheet, inspect each suspect original at 1:1, record reviewer and result per cell. Use the fresh R5 recover and R4 search profiles for their own action/search states. A snapshot without the associated live journey does not prove the gate.

Extend **one** recording in `tests/screenshots/capture.cjs`: start with its existing Compose → type → Saved → Back → reopen sequence, add body-search/open/Back and move; port ALL recovery beats from the local artifact `reports/r5-w5b-trash-ui-evidence/main-flow.spec.cjs` (compare to main-flow.webm): Field notes, Spring planting, actual delete confirmation, trash, restore, restored announcement and row, folder confirmation/count, confirm deletion, All Notes/search focus, verify detached/tombstoned ID via API. Preserve the prior seed/open fixtures or explicitly create them through the UI/API. Append any visible correction of a confirmed major R6 defect. Use named Save status and assertions between actions. Preserve the core-loop.webm, rendered GIF and mobile.png outputs for existing callers. Inspect playback from first Compose to final focus in the accepted candidate.

Keep complete synthetic captures under the evidence directory. For the README, derive compact screenshots from the contained originals; run in the evidence directory with R6_SRC set to the captures directory. The R2 originals measured 45,621 and 31,814 bytes with this exact command. Measure the actual outputs **before checkout writeback**. Copy only the two current JPEGs once W5c's entire size fits.

```bash
R6_SRC="$R6_OUT/screens.files/screenshots"  # W5b log name; use captures.files for W6
for name in notebook-light mobile; do
  ffmpeg -v error -i "$R6_SRC/$name.png" -vf scale=960:-2 -frames:v 1 -c:v mjpeg -q:v 5 "$R6_OUT/m1-$name.jpg"
done
wc -c "$R6_OUT"/m1-*.jpg
```

For **every evidence task**, record the previous script plus R6 steps, previous release comparison and chosen images. Compare SHA-256 of each candidate against *all* files under releases/R5; exclude byte-identical files regardless of name. A different hash can reflect cursor/time/seed text; compare like states visually and exclude those differences too. Inspect prior releases for already-shipped screens absent from the sparse R5 folder. Record candidate, matching/comparison path, SHA and reason for each keep/drop. After merge the coordinator adds only genuinely new/changed screens and the accepted cumulative recording to `~/.local/share/agent-artifacts/pocketbase-notes-app/releases/R6/`, updates the releases README row and uses the same selection on the progress page. Raw gate captures, contact sheets, README derivatives and the full R6 suite remain retrievable separately. If nothing visibly changed, record zero new stills. Earlier releases stay intact.
