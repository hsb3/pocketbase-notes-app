# Testing Notebook

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
its Chromium version. Linux hosts may need `bunx playwright install --with-deps chromium`.
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

Chromium desktop and mobile viewport coverage is automated. Safari/Firefox,
physical-phone keyboards, screen readers, OAuth and production deployment are not
covered. These commands run locally; no remote CI is configured.
