# Build: set up, run and test locally

Use when you need the app running or tested on this machine. Facts live in the build
docs listed below; this page is the order to do things in.

## Rules

- Servers and stacks run in Docker (the repo's Compose files set CPU, memory and
  process limits). Bounded commands (lint, knip, build, unit scripts) run on the host.
- Parallel or long-lived instances use a named stack: `make app STACK=<name>` with its
  own ports (see Local stacks). Stop what you started: `make down`, `make down-full`
  or `make stack-down STACK=<name>`. `make stack-destroy` deletes data and needs
  `CONFIRM=<STACK>`.
- `make seed` creates missing accounts and preserves existing passwords; resetting
  them needs `--reset-passwords` (via `SEED_ARGS`), only when asked.
- `make start` reads `.env`; `PB_PORT` may differ from 8080.

## Steps

1. `bun install`. `.env` is created from `.env.example` by `make env`, `make app`,
   `make start` or `make up*`; existing values are kept.
2. Pick one entry point (Development):
   - `make app` — whole app in Docker, seeded, prints URL and login. Rebuild with
     `make app` to pick up code changes.
   - `make start` — PocketBase in Docker + seed + Vite dev server.
   - `make start-full` — adds Mailpit (email) and RustFS (S3 files).
   - `make dev-solo` — frontend only, auth bypassed, for UI work without a backend.
3. Health and logs: `make health`, `make logs`.
4. Checks before a PR (Contributing): `bun run lint`, `bun run knip`, `bun run build`.
5. Behaviour tests (Verification) need a running full backend:
   `bun run test:install` once, `make up-full`, then `make smoke` or `make e2e`.
   Narrower suites: `bun run test:api`, `bun run test:accounts`,
   `bunx tsc -p scripts/tsconfig.json`.
6. A type-checked build proves shapes, not behaviour. If you could not exercise a
   change live, say so in your report.
