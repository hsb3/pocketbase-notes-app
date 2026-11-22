# Testing PocketBase Notes

## Disposable Docker gates

```sh
make test-api-contained
make test-browser-contained
```

Run either command from the repository root with Docker Compose v2.24.4 or later,
Bash, Python 3, OpenSSL and GNU `timeout` available. Each run generates its own
credentials and Compose project. A capped preparation container downloads the
checksum-pinned PocketBase binary, installs the frozen Bun lockfile and builds the
frontend. It exits before the tests begin.

The default API target compares two fresh generations of PocketBase types with the checkout, runs the loopback guards and staged upgrade, then exercises mail, storage, account isolation, protected attachments, MFA, backup health and note records. The upgrade fixture checks that replay preserves default-folder IDs and that R1 notes and folders survive removal of entries.

The default browser target serves the production build on shared loopback and runs Chromium and WebKit with signup disabled. Both engines exercise Compose and reopen at 390, 810 and 1440 CSS pixels, delayed writes, blocked navigation on failure, page restoration, caret retention and projected list traffic. The warm Compose timing check logs 20 single-key trials per engine and requires at least 19 focused insertions within one second.

The runtime network is internal. Services have CPU, memory and PID limits and publish no ports. Each command has a 29-minute deadline plus one minute for teardown. The runner checks that no project-labeled containers, networks or volumes remain. On browser failure it copies the report and traces to `test-results/<project>/`.

### Additional profiles

Choose one profile per invocation, for example `make test-api-contained CONTAINED_PROFILE=restore`.

| Target | `CONTAINED_PROFILE` | Checks or output |
| --- | --- | --- |
| `test-api-contained` | `accounts` | Seed bootstrap and explicit reset on a private local database. Verify credentials, stable sample IDs and preservation of existing records. |
| `test-api-contained` | `restore` | Extract a backup, boot a second server with the matching key, verify its disabled jobs, compare records and protected file bytes. |
| `test-api-contained` | `load` | Short k6 smoke of list, create, update and download. [Capacity testing](load-testing.md) uses a separate workload. |
| `test-browser-contained` | `resilience` | Check all 30 combinations of recovery scenario, viewport and engine. Retains Playwright JSON under `test-results/<project>/sc003.json`. |
| `test-browser-contained` | `search` | Check cross-folder results, draft navigation, keyboard focus and layout. Retains the [search timings and screenshots](#cross-folder-search). |
| `test-browser-contained` | `plain` | Exercise the hosted default selection against the production bundle. Exclude the 12 ageing fixture cases at discovery. Retain `plain.list.json` and `plain.json`. |
| `test-browser-contained` | `recover` | Exercise note moves, note and folder deletion, restore, interrupted replies and keyboard focus. Runs both complete recovery suites, including the 12 ageing cases, and retains the [recovery report and screenshots](#move-delete-and-restore). |
| `test-browser-contained` | `pin` | Exercise Pin, the Pinned view and a lost pin reply. Runs `tests/e2e/pin.spec.cjs` and retains the [pin report and screenshots](#pin). |
| `test-browser-contained` | `journal` | Exercise journal dates, the Journal view and its day filter, time zones, a second device and a lost date reply. Runs `tests/e2e/journal.spec.cjs` and retains the [journal report and screenshots](#journal). |
| `test-browser-contained` | `live` | Exercise [live updates](#live-updates) between two devices of one account. Runs `tests/e2e/live-updates.spec.cjs` and retains `live.json` with the SC-001 timings. |
| `test-browser-contained` | `operator` | Run the operator commands against local services, including autosave, file access, failed-write cleanup, signup policy and Mailpit email. |
| `test-browser-contained` | `signup`, `signup-disabled` | Exercise registration with the selected policy in Chromium and WebKit. Enabled signup sets both the frontend build flag and the backend runtime flag. |
| `test-browser-contained` | `performance` | Chromium editor loading benchmark and [Chromium/WebKit flicker measurements](#note-list-and-editor-continuity). Copies the report under `test-results/<project>/performance/`. |
| `test-browser-contained` | `screenshots` | Seed a notebook and capture the responsive workspace. Copies images and video under `test-results/<project>/screenshots/`. Host FFmpeg renders the phone strip and GIF. |

To regenerate the checked-in PocketBase types, run `scripts/run-contained.sh codegen`. This uses a seeded disposable stack, compares two generations and copies the result to `src/services/pocketbase-types.ts`. The default API gate only compares.

### Note list and editor continuity

Run the contained profile, then pass the directory printed after `Performance smoke report` to the scorer (Python 3.10+).

```sh
CONTAINED_PROFILE=performance scripts/run-contained.sh browser
python3 scripts/score-flicker.py PATH_TO_PRINTED_REPORT_DIRECTORY --gate
```

Chromium and WebKit each run three trials on ordinary loopback and three with 120 ms added to note reads. In the delayed trials, seven keys are typed while a successful save reply is held. The CSV contains one row per save, warm note switch and confirmed move. It reports list, untouched row and editor identity changes, loading placeholders seen during animation frames, key timings and frame gaps. The HTML report also includes a Chromium filmstrip for the first trial in each condition. Headless frame callbacks and screenshots cannot establish what reached a physical display or how a screen reader announced the change.

Measurement cases can pass while the notebook flickers. Omit `--gate` for CSV alone. With it, the scorer exits 1 if a save or move loses list or editor continuity, or a warm switch samples a full-pane loading placeholder. **The verdict is non-gating and red by design until the flicker fix lands.** The fix task makes this check required. [Notebook flicker on save, switch and move (#57)](https://github.com/hsb3/pocketbase-notes-app/issues/57)

### Save recovery

Run `make test-browser-contained CONTAINED_PROFILE=resilience` for one round. Five cases cover a refused save, lost create and update replies, Retry after more typing, session expiry, and two editors writing the same revision. Chromium and WebKit each run at 390, 810 and 1440 CSS pixels with one worker and zero retries. The checker requires one passing attempt in every cell. Playwright selects `@sc003` on the command line and writes `sc003` in JSON. To recheck a retained report, run `python3 scripts/check-sc003.py test-results/<project>/sc003.json` with the printed project ID.

The tests use independent owner reads to verify the note count, ID, full body and revision. They reopen the result in a separate browser context. SC-002 allows 1000 ms each from input to request and from known failure to visible Retry. The R3 matrix measured 505–513 ms from input to request and 2.0–4.3 ms from failure to Retry across the six engine and width combinations. In the full suite, healthy writes started after 506.9–512 ms. A successful response was held for 3358–3394.6 ms, and later typing stayed Pending until its own acknowledgement. [Timings by engine and width](../../specs/002-notes-redesign/r3-resilience/tasks.md#r3-gate-evidence)

The default browser run also checks invalid and unavailable notes, blocked clipboard, failed reload, navigation, sign-out and the native leave warning. The R2 failed-save Back test now chooses **Keep editing** in the leave dialog before checking the original URL and retained words. Password reauthentication after expiry was exercised against PocketBase. OAuth and MFA reuse the existing sign-in completion path according to source inspection. Live expiry recovery with those methods remains unverified.

R3 requires one complete matrix and both default contained targets. R6 recorded ten consecutive recovery runs (300 first-attempt passes) and three consecutive full rounds. For the physical observations and owner waivers, see [manual release checks](#remaining-manual-release-checks). [Release procedure](../../specs/002-notes-redesign/r3-resilience/quickstart.md#commands-and-release-evidence)

### Cross-folder search

Run `make test-browser-contained CONTAINED_PROFILE=search`. The runner prints the path to `test-results/<project>/sc004.json`. Recheck it with `python3 scripts/check-sc004.py PATH_TO_SC004_JSON`. The adjacent `r4-search-views/` directory holds the filled and empty views in light and dark for each engine and width.

Each timing case starts with 20 active notes in each of five folders. Each of 20 distinct body-only searches must issue a fresh request and show the expected note, folder and original highlighted text. The clock starts at the final input event and includes Enter, the request, rendering and a paint opportunity. SC-004 requires all results to be correct and at least 19 of 20 to appear in under 2000 ms **in each cell**. The table shows the retained run from 2026-11-19. Timings use the checker’s one-decimal display.

| Engine | CSS width | Under 2000 ms | Minimum (ms) | Median (ms) | Maximum (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium | 390 | 20/20 | 41.6 | 49.6 | 161.7 |
| Chromium | 810 | 20/20 | 45.8 | 49.9 | 116.7 |
| Chromium | 1440 | 20/20 | 44.9 | 51.9 | 89.0 |
| WebKit | 390 | 20/20 | 30.0 | 37.0 | 71.0 |
| WebKit | 810 | 20/20 | 31.0 | 43.0 | 51.0 |
| WebKit | 1440 | 20/20 | 31.0 | 46.0 | 56.0 |

All 46 search cases passed on one attempt. In the API gate, a second account and an anonymous reader each found zero results for the first account’s unique term. The first account’s own deleted note also yielded zero results. R6 recorded the [physical-phone and cross-device observations](#remaining-manual-release-checks). [Tested commits, individual timings and retained evidence](../../specs/002-notes-redesign/r4-search/tasks.md#r4-gate-evidence)

### Move, delete and restore

Run `make test-browser-contained CONTAINED_PROFILE=recover`. The two R5 suites drive Chromium and WebKit at 390, 810 and 1440 CSS px, with one worker and zero retries. Independent record reads verify the note’s folder, revision and deletion state. Keyboard tests cover Cancel, stale previews, missing notes, lost replies and read-only verification after the initiating control disappears. The runner saves `recover.json` and `r5-views/` under the printed project’s `test-results/` directory. The five captured states are Move, Delete note, folder confirmation, populated trash and empty trash in both themes.

In the release evidence bundle, `reports/r5-w5b-trash-ui-evidence/r5-views/` holds the full capture set and `reports/r5-w5b-trash-ui-evidence/main-flow.webm` shows the flow. Use `reports/r5-w5c-contrast-evidence/r5-views/` for the final Delete note button in both themes. [Measured results by commit](../../specs/002-notes-redesign/r5-recover/tasks.md#r5-gate-evidence)

The default API gate exercises the retention boundary in the pinned PocketBase JS runtime, forces a folder transaction rollback and reads private RustFS objects before and after a real purge. Historical upgrade fixtures exclude the purge hook and verify its absence through the admin API. On the fresh default API and default/recover browser stacks, the runner writes `zz-manual-cron.pb.js` only inside the disposable preparation container. Its native `$app.onServe().bindFunc` callback verifies exactly one production `expired-notes` job at `17 3 * * *`, then re-registers that job’s native `run` under the same ID at the never-due `0 0 30 2 *` before continuing startup. The scheduler keeps running for backups and hourly cleanup. After health and authentication the fixture verifies both job registrations, invokes the real purge and requires a fresh successful zero-removal summary before seeding notes.

### Pin

Run `make test-browser-contained CONTAINED_PROFILE=pin`. The suite drives Chromium and WebKit at 390, 810 and 1440 CSS px with one worker and zero retries. It pins by keyboard, checks the folder order and marker, saves from a second browser that already had the note open, aborts a committed pin reply and retries it, and composes from Pinned. Independent record reads confirm that a pin leaves `revision` and `updated` unchanged. The runner saves `pin.json` and `r7-views/` under the printed project's `test-results/` directory: the folder list, the Pinned view and its empty state, in both themes.

The default API gate runs `scripts/test-pins.ts` and the staged R7 migration up, down and up again in `scripts/test-r2-upgrade.sh`.

### Journal

Run `make test-browser-contained CONTAINED_PROFILE=journal`. The suite drives Chromium and WebKit at 390, 810 and 1440 CSS px with one worker and zero retries. It dates a note by keyboard, checks the Journal headings, order and folder names, filters by day through the address, composes from Journal, compares devices in `Pacific/Kiritimati` and `Pacific/Pago_Pago` with a fixed clock, follows a day changed on a second device, aborts a committed date reply, and keeps a dated note through move, delete and restore. Independent record reads confirm that a date leaves `revision` and `updated` unchanged. The runner saves `journal.json` and `r8-views/` under the printed project's `test-results/` directory: Journal with days, an empty day, the empty Journal and the date dialog, in both themes.

The default API gate runs `scripts/test-journal.ts` and the staged R8 migration up, down and up again in `scripts/test-r2-upgrade.sh`, with the query plans of the real Journal list SQL.

### Live updates

The default API gate runs `scripts/test-live-updates.ts`, which reads raw SSE from `/api/realtime` with `fetch` because Bun has no `EventSource`. It checks one owner-only notice per committed write with exactly the contract keys, none for refused writes, none for another account, a guest or a superuser, and a 403 when another account takes over the connection.

Run `make test-browser-contained CONTAINED_PROFILE=live` for `tests/e2e/live-updates.spec.cjs` in Chromium and WebKit at 390, 810 and 1440 CSS px with one worker and zero retries. It covers a clean note taking another device's save, the conflict at once for unsaved words, moves adopted with a save in flight, pins, deletes, a pending move, live lists that keep rows, scroll, focus and search text, Recently Deleted, a 30-note folder delete, catch-up on focus and reconnect, the R3 path with realtime blocked, session end and account switch, and 20 timed edit-to-visible trials per engine. The runner saves `live.json` under the printed project's `test-results/` directory; the timings are attached to the SC-001 case. Tests that need a stale second device, such as R3 and R5 conflicts, abort `/api/realtime` in that context so they keep testing the fallback path.

## Commands and coverage

| Command | Coverage |
| --- | --- |
| `bun test tests/unit` | `tests/unit/note-draft.test.cjs` checks debounce, write order, retained edits, stable IDs, revision handling and record requests. Runs without a server. |
| `bun run lint` / `bun run knip` | Biome formatting/lint and unused code or dependencies |
| `bun run build` / `bun x tsc -p scripts/tsconfig.json` | Application and config type checks, production build and operational script types |
| `python3 scripts/ai-context.py check` / `bun run docs:build` | Topic paths and budgets, documentation render and dead links |
| `make smoke` / `bun run test:smoke` | Existing disposable full stack. Mailpit verification/reset, RustFS bytes, browser login and private note reload. |
| `bun run test:e2e` / `bun run test:accounts` | Hosted-runner commands for the API/browser suite and account/operator/restore drills. [CI setup](../ci/checks-and-rules.md) |

`scripts/test-notes.ts` compares the decoded bytes of full and projected lists on the same records. The list returns only ID, folder, title, update time and body excerpt. Tests check limits, hidden fields, account isolation and revision conflicts. `scripts/test-attachments.ts` runs the orphan job and verifies that an aged referenced file and a fresh orphan survive while an aged orphan is removed.

## Frontend and credentials

Without `TEST_APP_URL`, Playwright starts a Vite development server at `http://127.0.0.1:4173`, with the auth
bypass disabled. The port must be free; an unrelated server is never silently reused.
The default full browser suite requires a production editor chunk for its timing check. Use the contained target or point `TEST_APP_URL` at the built loopback app. The configured
backend is `VITE_PB_URL`. Browser tests reject remote URLs before sending credentials.
`TEST_PB_URL` applies only to the standalone notes API script.

Fixtures create unique synthetic users and delete them in teardown, including when
a test fails. Browser contexts are isolated and managed by Playwright. Tests run
serially without retries so a failure remains visible. Service checks remove their
captured emails. An interrupted process or unavailable backend may prevent cleanup;
use a disposable development instance, never production.

## Results and debugging

```sh
bun run test:report
bunx playwright test --grep @smoke --headed
bunx playwright show-trace test-results/<failed-test>/trace.zip
```

`playwright-report/` contains the HTML report. `test-results/` contains scenario
screenshots and failure screenshots/traces. These directories are gitignored;
test runs do not overwrite `docs/images/`. Treat traces as private: they can contain
synthetic credentials and authenticated requests. `DEBUG_BROWSER=1` prints browser
console errors from the full scenarios. Each new browser run replaces prior outputs.

The README shows the Milestone 1 notebook on desktop and phone. To capture the current notebook, run `scripts/capture-screenshots.sh` with no arguments. It invokes the screenshots profile and prints the output directory. Review images there before publishing.

## Limits

Chromium and WebKit run on emulated viewports. See the manual checks below for physical Safari coverage and remaining device, accessibility and OAuth checks. Hosted E2E and Recover both run on Linux amd64. [CI configuration](../ci/checks-and-rules.md)

## Production editor performance

Run `make up-full` to build and serve the production image locally, then
`bun run test:performance`. The benchmark rejects Vite development HTML and uses
only the existing loopback backend URL, creating and deleting synthetic users.
It does not change user notes. Run it alone, without other browser/test workloads.

The Chromium benchmark repeats cold-cache and warm-cache direct editor navigation
five times for title-only, representative, large and ten-image notes, plus the All Notes list. It records time until the editor is editable, confirmation
of typed input, resource transfers, long tasks and completion of private-image loading.
The input/ready times include Playwright polling overhead; they are observed upper
bounds, not exact event timestamps. Editor parse time is not isolated by this benchmark. Warm means a same-context reload, not
client-side reopening. For the app shell, the readiness marker is the visible
Compose button, and input confirmation is null. Image requests may still be loading
when the editor becomes editable; `imagesReadyMs` separately waits for all ten
images to decode successfully.

The simulated mobile profile uses a 390×844 viewport, 4× CPU slowdown, 100 ms
latency and 1.6 Mbps download / 750 Kbps upload. It is not a physical phone. Local
PocketBase and the image's asset compression/cache behavior are part of this
baseline; rerun against the deployed origin with a dedicated staging harness
before drawing conclusions about Railway performance.

Raw JSON is attached to the performance HTML report under
`playwright-report/performance/`; temporary artifacts live under
`test-results/performance/`. Preserve a completed report before another full test
run replaces these ignored directories. No performance budget is enforced until
the baseline is reviewed. Do not optimize solely to silence Vite's chunk warning.

## Remaining manual release checks

On November 20, 2026 the owner used Safari on an iPhone 14 Pro Max over Tailscale Serve and Chrome on a Mac with W6 candidate `5e6f0ba`. The phone reported iPhone OS 18_7 and Safari Version/27.2 in its user agent. The owner confirmed caret/keyboard visibility and autosave. An already-open note needed reopening to pick up a remote edit ([#68](https://github.com/hsb3/pocketbase-notes-app/issues/68)).

For SC-006 the owner created Seed order in Garden and found it by searching for “calendula” on desktop without assistance. The request log spans about 71 seconds to the desktop search. The owner used no stopwatch, the final open was outside the retained log, the stored body differed from the card twice, and both devices had been used beforehand. The owner waived physical leave/Retry, native reload and expiry and substituted the 390 px WebKit evidence. These three physical outcomes and a clean timed first attempt remain unverified. Individual G8/G9 sign-off belongs in the PR. [Accepted machine coverage](../../specs/002-notes-redesign/r6-gate/coverage.md)

For further manual checks, record browser/device/OS, date, evidence and pass/fail/not-tested for:

- Actual Safari: login, Compose, autosave, reload and existing private images.
- Keyboard and VoiceOver: tab order, visible focus, folder dialog, login errors, save feedback and failed navigation; include zoom/reflow and contrast.
- Physical iOS and Android keyboards: caret visibility, viewport resizing, selection,
  composition/autocorrect, save/navigation guards and external keyboard shortcuts.
- Selected OAuth providers: success, cancellation, denied access, popup blocking,
  account linking, logout/relogin and private-data isolation on staging HTTPS.

These checks are not satisfied by mobile viewport screenshots or a WebKit pass.

## Measured baseline — 2026-10-19

Historical measurements of the retired entries interface follow. The notes benchmark uses different routes and fixtures.

100 samples passed on Apple M2 Pro, macOS/Darwin 27 arm64, Chromium 156.0.8078.4.
Five repetitions per fixture/profile/cache combination. Values below are median
observed readiness times in seconds; polling overhead is included as described above.

| Fixture | Desktop cold | Desktop warm | Simulated mobile cold | Simulated mobile warm |
| --- | ---: | ---: | ---: | ---: |
| empty | 0.46 | 0.84 | 17.40 | 1.78 |
| representative | 0.45 | 0.85 | 17.50 | 1.42 |
| large | 0.46 | 0.39 | 18.03 | 2.41 |
| attachments | 0.46 | 0.37 | 17.61 | 1.43 |
| app-shell | 0.13 | 0.04 | 5.28 | 0.88 |

The ten-image fixture also verified all images decoded: simulated-mobile medians
were 21.85 seconds cold and 5.64 seconds warm. Editor readiness does not imply
all attachments have finished loading.

The typical cold-mobile sample transferred the editor JavaScript as 2,311,341
bytes over about 11.80 seconds. A separate GET advertising gzip/br returned no
`Content-Encoding` and a `Content-Length` of 2,311,341, with no `Cache-Control`.
Vite’s roughly 705 KB gzip figure is an estimate, not the bytes this local server
actually sent. The main app chunk transferred another 664,421 bytes.

Interpretation: asset delivery is the first optimization candidate. Verify and
enable suitable compression for public assets, then remeasure before removing
editor features or restructuring its bundle. Do not apply public caching to
private notes or protected files. Railway headers and timings remain unverified.

Proposed loading budgets for review, not yet enforced: median desktop readiness
at most 1 second; simulated-mobile editor readiness at most 6 seconds cold and
3 seconds warm under this exact profile. Image completion needs its own budget.

Evidence (local, preserved outside disposable Playwright output):
The archived editor-baseline evidence bundle contains `baseline.json`, `performance-report/index.html` and
`browser-report/index.html`. Raw JSON includes every run, fixture sizes, resources,
long tasks, commit and working-tree state. It contains synthetic test data only.

Validation: lint, build, the service/API suite, all six Chromium/WebKit browser
scenarios and the complete performance benchmark passed. Firefox is deferred by
project scope and excluded from installation and the local/CI matrix. Playwright
downloaded its own Firefox build; it failed at profile launch, with no evidence
of a licensing failure. The revised CI matrix has not been run remotely. Actual Safari, physical keyboards, accessibility
and OAuth remain separate open verification items.

## Railway smoke and registration checks — 2026-10-19

These results predate R2. The live staging app passed browser login, note save/reload, private attachment
bytes, anonymous/cross-account denials, restart persistence, and a portable backup
restore in an isolated local instance. Resend reported verification/reset emails
delivered and their tokens were accepted. See [Operations](../../deploy/OPERATIONS.md) for the runbook.

Registration now defaults off via `VITE_SIGNUP_ENABLED=false`. The local regression
runs on Chromium and WebKit, and the live deployment separately proved anonymous
and authenticated non-admin signup return 403, superuser creation still succeeds,
the form is absent and existing login works. Positive test accounts were deleted.
The existing accounts and their test note/attachment were preserved. Deployed
opt-in mode and live OAuth login remain unverified. The local opt-in registration
and verification retry flow passed both browser projects during the
2026-11-15 repository review.

The account-menu admin shortcut is covered in Chromium and WebKit: it resolves
against the configured PocketBase URL (including a separate local backend port),
opens a separate tab showing the admin password field, and leaves the app tab open.
The link is navigation only; it does not confer superuser access or share credentials.


The explicit signup-enabled check is a separate phase; both the backend runtime
and Vite frontend must use `VITE_SIGNUP_ENABLED=true` before running
`bunx playwright test tests/e2e/registration-enabled.spec.cjs`. The default-disabled configuration excludes the enabled file at discovery. CI configures both flags on its disposable stack, runs the
extra phase and keeps a separate report; see [CI configuration](../ci/checks-and-rules.md).


`test:accounts` requires a disposable local full stack with no existing attachment
records or backup configuration. It temporarily changes local storage/mail settings
for the configuration and restore drills and restores them in cleanup. It never
uses personal app-user credentials. CI runs it before the signup-enabled phase.
