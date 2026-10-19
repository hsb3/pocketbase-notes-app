# Testing PocketBase Notes

## Setup

Requirements: Bun, Node.js 22 or later, Docker Compose, and `.env` configured from
`.env.example` with matching backend URL/port and local superuser credentials.

```sh
bun install
bun run test:install
make up-full
make smoke
make e2e
```

Playwright is a project dev dependency pinned by `bun.lock`. `test:install` installs
its Chromium and WebKit versions. Linux hosts may need
`bunx playwright install --with-deps chromium webkit`.
The backend stays running; tests never seed or reset existing development accounts.
`make up-full` initializes a fresh backend and configures Mailpit and RustFS.

## Commands and coverage

| Command | Coverage |
| --- | --- |
| `make smoke` / `bun run test:smoke` | Mailpit verification/reset emails and token use; real RustFS upload/download bytes; browser login, private note save and reload |
| `make e2e` / `bun run test:e2e` | All API checks and browser scenarios, including smoke |
| `bun run test:api` | Services, entry validation, account isolation, concurrent saves, protected files and attachment cleanup |
| `bunx playwright test` | Browser scenarios only |
| `bun run lint` | Formatting and lint |
| `bun run build` | Application/config TypeScript checks and production frontend build |
| `bunx tsc -p scripts/tsconfig.json` | Backend verification/setup script types |

The notebook scenario covers notes, journals, formatting, undo/redo, search,
favorites, date filters, navigation guards, failed saves, concurrent edits,
reauthentication with draft preservation, confirmed deletion, collapsible navigation,
full-screen writing, compact spacing and the bottom information rail on desktop/mobile.

The attachment scenario covers uploads before first Save, private image reloads,
download bytes, underline, slash/table insertion, removal, rejected file types and
mobile width. API tests additionally check anonymous/cross-account denial, unsafe
URLs, file limits, reference-safe deletion and orphan selection. Files travel through
PocketBase to the actual RustFS bucket. Mailpit captures mail locally.

## Frontend and credentials

By default Playwright owns a Vite server at `http://127.0.0.1:4173`, with the auth
bypass disabled. The port must be free; an unrelated server is never silently reused.
Set `TEST_APP_URL` to use an already-running local frontend instead. The configured
backend is `VITE_PB_URL`. Browser tests reject remote URLs before sending credentials.
`TEST_PB_URL` applies only to the standalone entries API script.

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

## Limits

Chromium and WebKit projects run the same desktop/mobile-viewport
scenarios. A configured project is not a passing result; see the recorded run below.
Actual Safari, physical-phone keyboards, screen readers, OAuth and production
deployment still require separate verification. [GitHub Actions](CI.md) runs the same suite on Linux amd64 and arm64.

## Production editor performance

Run `make up-full` to build and serve the production image locally, then
`bun run test:performance`. The benchmark rejects Vite development HTML and uses
only the existing loopback backend URL, creating and deleting synthetic users.
It does not change user notes. Run it alone, without other browser/test workloads.

The Chromium benchmark repeats cold-cache and warm-cache direct editor navigation
five times for empty drafts, representative entries, large entries below the
100 KB document limit, ten-image notes and the app shell. It records time until the editor is editable, confirmation
of typed input, resource transfers, long tasks and completion of private-image loading.
The input/ready times include Playwright polling overhead; they are observed upper
bounds, not exact event timestamps. Editor parse time is not isolated by this benchmark. Warm means a same-context reload, not
client-side reopening. For the app shell, the readiness marker is the visible
New note link, and input confirmation is null. Image requests may still be loading
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

Record browser/device/OS, date, evidence and pass/fail/not-tested for:

- Actual Safari: login, formatting, table/image insertion, save/reload and downloads.
- Keyboard and VoiceOver: tab order, visible focus, toolbar/slash menus, dialogs,
  login errors, save feedback and conflict recovery; include zoom/reflow and contrast.
- Physical iOS and Android keyboards: caret visibility, viewport resizing, selection,
  composition/autocorrect, save/navigation guards and external keyboard shortcuts.
- Selected OAuth providers: success, cancellation, denied access, popup blocking,
  account linking, logout/relogin and private-data isolation on staging HTTPS.

These checks are not satisfied by mobile viewport screenshots or a WebKit pass.

## Measured baseline — 2026-10-19

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
`~/.local/share/agent-artifacts/react-pocketbase/2026-10-19-editor-baseline/`
contains `baseline.json`, `performance-report/index.html` and
`browser-report/index.html`. Raw JSON includes every run, fixture sizes, resources,
long tasks, commit and working-tree state. It contains synthetic test data only.

Validation: lint, build, the service/API suite, all six Chromium/WebKit browser
scenarios and the complete performance benchmark passed. Firefox is deferred by
owner request and excluded from installation and the local/CI matrix. Playwright
downloaded its own Firefox build; it failed at profile launch, with no evidence
of a licensing failure. The revised CI matrix has not been run remotely. Actual Safari, physical keyboards, accessibility
and OAuth remain separate open verification items.

## Railway smoke and registration checks — 2026-10-19

The live staging app passed browser login, note save/reload, private attachment
bytes, anonymous/cross-account denials, restart persistence, and a portable backup
restore in an isolated local instance. Resend reported verification/reset emails
delivered and their tokens were accepted. See `deploy/README.md` for the runbook.

Registration now defaults off via `VITE_SIGNUP_ENABLED=false`. The local regression
runs on Chromium and WebKit, and the live deployment separately proved anonymous
and authenticated non-admin signup return 403, superuser creation still succeeds,
the form is absent and existing login works. Positive test accounts were deleted.
The owner's two accounts and their test note/attachment were preserved. The opt-in
true mode and live OAuth login remain unverified.

The account-menu admin shortcut is covered in Chromium and WebKit: it resolves
against the configured PocketBase URL (including a separate local backend port),
opens a separate tab showing the admin password field, and leaves the app tab open.
The link is navigation only; it does not confer superuser access or share credentials.
