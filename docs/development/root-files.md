# Root Config Files

What each file at the repo root does and why it exists.

## Build & Frontend

### `package.json`

Declares dependencies (React 19, TanStack Router, PocketBase SDK, Tailwind) and scripts (`dev`, `build`, `lint`, `pb:codegen`). Its `trustedDependencies` field whitelists which packages may run postinstall scripts under Bun (`@biomejs/biome`, `esbuild`) — everything else is blocked. Necessary: it is the package manifest; nothing installs or builds without it.

### `bun.lock`

Bun's lockfile pinning the exact resolved version of every dependency. Necessary for reproducible installs — `bun install --frozen-lockfile` in the Dockerfile fails if it drifts from `package.json`.

### `bunfig.toml`

Bun runtime/install config. Sets `minimumReleaseAge = 604800` so a newly published package version can't be installed until it is 7 days old — a supply-chain-attack mitigation (malicious versions are usually yanked within days). Works together with `trustedDependencies` in `package.json`.

### `vite.config.ts`

Vite build/dev-server config. Registers the React plugin, Tailwind v4 (via `@tailwindcss/vite` — there is no `tailwind.config` file), and the TanStack Router plugin that generates `src/route-tree.gen.ts` from the file-based routes. Also defines the `@` → `./src` import alias. Necessary: without it there is no JSX transform, no Tailwind, and no generated route tree.

### `index.html`

Vite's entry point. Vite serves and bundles starting from this file; it mounts `src/main.tsx` into `#root`. Required by Vite — it is the app shell, not a static asset.

### `tsconfig.json`

TypeScript config for the app source (`src/`). Strict mode, bundler-style module resolution, `noEmit` (Vite does the emitting; `tsc` in the `build` script is type-check only), and the `@/*` path alias matching the Vite alias. Unused-variable checks are deliberately left to Biome so only one tool reports them.

### `tsconfig.node.json`

Separate TS project for Node/Bun-context files — `vite.config.ts`, `playwright.config.ts`, `playwright.performance.config.ts` and the docs site's `.vitepress/config.ts`. Needed because the config file runs in a Node-like environment, not the browser, so it must not share the DOM-lib settings of the main tsconfig. Checked explicitly by the `build` script (`tsc -p tsconfig.node.json`) on the host and in CI. The Docker image build does not use it: it type-checks `src/` and bundles, so the Playwright configs are not image inputs.

## Code Quality

### `biome.json`

Biome formatter + linter config (replaces ESLint/Prettier). Defines the rule set, formatting style (2-space, 80-col, LF), Tailwind class sorting via `useSortedClasses`, and excludes generated files (`src/route-tree.gen.ts`, `src/services/pocketbase-types.ts`, `pb/`). Backs the `lint`/`lint:fix` scripts.

### `components.json`

Aliases explicitly route UI components and hooks into the existing `src/` folders; `iconLibrary` selects Tabler. The `registries` map includes `@prosekit` for discovering ProseKit editor components through the shadcn CLI. Registering it does not install an editor or its dependencies.

shadcn/ui CLI config. Tells `shadcn add <component>` where to put components (`@/components`), where the Tailwind CSS entry lives (`src/styles/globals.css`), and the base style. Only needed when adding/updating shadcn components; harmless otherwise but the CLI won't work without it.

## Backend & Deployment

Deployment files live under `deploy/`, organized by target — see [`deploy/README.md`](../../deploy/README.md).

### `deploy/docker/Dockerfile`

Multi-stage build: (1) a Bun `deps` stage installs from the frozen lockfile and feeds `frontend-build`, which type-checks `src/` and builds the frontend to `dist/`, and `tools`, which adds `scripts/` for the self-contained stack's setup container; (2) the default Alpine stage downloads a pinned, SHA256-verified PocketBase binary (per-arch checksums, native amd64/arm64 via `TARGETARCH`) and serves the built frontend from `pb_public` alongside hooks and migrations. Copies only frontend build inputs and produces the single production image. PocketBase serves both API and static frontend on port 8080 with `/pb` as its working directory and an API healthcheck. The PocketBase server version (0.40.x) is version-coupled to the `pocketbase` JS SDK (^0.28) in `package.json` — bump them together.

### `deploy/local/docker-compose.yml`

Standard local backend: builds the shared Dockerfile, mounts `pb/data`, `pb/hooks`, `pb/migrations` for persistence and live hook/migration editing, binds the published port to loopback, and requires `PB_ENCRYPTION_KEY` from `.env` (settings encryption; generated when empty). This is what `make up` runs (from the repo root, via `--project-directory .`). Like every local Compose service it has CPU, memory and process limits.

### `deploy/local/docker-compose-full.yml`

Extended dev stack: PocketBase plus Mailpit (SMTP catcher for testing emails, UI on :8025) and RustFS (S3-compatible storage on :9000/:9001). Host ports and container names have `.env` overrides so two checkouts can run side by side. Run with `make up-full` when developing email or file-storage features; the default compose file suffices only while persisted PocketBase settings do not depend on these services.

### `deploy/local/docker-compose-stack.yml`

Self-contained variant of the full stack for running the app, or long-running and parallel local instances: no bind mounts from the checkout (hooks, migrations and frontend are baked into the image; data, Mailpit certificate and files live in per-stack named volumes) and no fixed container names. Its `setup` one-shot service runs the configure and seed scripts in a container built from the Dockerfile's `tools` stage, so the host needs only Docker. Run with `make app` (optionally `STACK=<name>`); see [local stacks](../../deploy/LOCAL.md#self-contained-stacks).

### `deploy/railway/railway.json`

Railway config-as-code: Dockerfile builder pointing at `deploy/docker/Dockerfile`, healthcheck on `/api/health`, restart policy. It takes effect only when the service's config file path points at it; otherwise apply the same settings directly on the service, and confirm either way on the deployment details page. The service needs `PB_ENCRYPTION_KEY` and a volume at `/pb/pb_data`. See the [Railway guide](../../deploy/RAILWAY.md).

### `.dockerignore`

Keeps secrets (`.env`, `*.pem`, keys/certs), `node_modules`, `pb/data`, and build output out of the Docker build context. Necessary for security (no secrets baked into images) and fast builds.

## Environment & Workflow

### `.env.example`

Template for `.env`, including backend credentials, local URLs, seed users, RustFS settings, port/container overrides and test overrides. Comments describe defaults and consumers. Secrets are left empty on purpose: `scripts/init-env.sh` (run by `make app`, `make start`, `make up*` and `make env`) copies the template when `.env` is missing and generates empty secrets without touching values that are set. `VITE_*` values are public build-time configuration; the real `.env` is gitignored.

`VITE_AUTH_BYPASS` skips the frontend guard only in development. `VITE_SIGNUP_ENABLED` controls the registration UI at build time and public account creation in the backend at runtime; only the exact value `true` enables it. Sharing, collaboration, AI and offline sync are not implemented and have no enable switch. SMTP/S3 enablement lives in persisted PocketBase settings; `make up-full` configures local providers. Editor capabilities and attachment limits live in code/schema; see [attachment behavior](../features/attachments.md).

### `Makefile`

Task runner tying everything together. `make help` opens with which entry point to use: `make app` (whole app in Docker, seeded, no Bun), `make start` (backend up + seed + dev server) or `make start-full` (adds Mailpit and RustFS). Also `up`/`up-full`/`down`/`logs`/`health`/`seed`/`codegen`/`dev-solo`, the `stack-*` targets, and `railway-*` operator targets split into read-only checks and mutating ones that refuse to run without `CONFIRM=<deployment hostname>`. Loads `.env` automatically and runs the compose files in `deploy/local/` with the repo root as project directory.

### `.gitignore`

Excludes build output, `node_modules`, secrets (`.env`, `*.pem`), PocketBase data (`pb/data`), and local agent/editor state from version control.

### `.vitepress/config.ts`

The docs site. VitePress renders the repository's own Markdown (`docs/`, `deploy/*.md` and the root guides; `README.md` is the home page) for GitHub Pages under `/pocketbase-notes-app/`. Links to code and config files become GitHub links, and a link to a missing file fails `bun run docs:build`. Output goes to `.vitepress/dist` (ignored); `.github/workflows/docs.yml` builds it on pull requests and deploys it from `main`.

### `docs/architecture/spec.md`

Product purpose, boundaries and links to the notes/journal design.

Agent-skill examples under `.agents/skills/` are excluded from Biome because they are vendored references, not application source. CLI scripts may report status through the console; application console warnings remain enabled.

The adopted prebuilt UI imports the ProseKit registry’s Tailwind icon plugin in
`src/styles/globals.css`; its Lucide icon data and React icons are installed dependencies.
Application controls retain their existing Tabler icons.

## Full-stack development integration

`deploy/local/docker-compose-full.yml` adds service health checks, loopback-bound
Mailpit/RustFS ports and a one-shot `storage-init` setup profile. `make up-full` runs
that initializer and `scripts/configure-services.ts`; `make start-full` also seeds
and starts Vite. `make check-services` runs `scripts/test-services.ts` against real
email and storage APIs. `.env.example` documents `RUSTFS_BUCKET` and `DEV_APP_URL`.

### `playwright.config.ts`

Runs browser scenarios in `tests/e2e/` with isolated users, serial Chromium and WebKit execution,
a managed Vite server and failure artifacts. `.env` supplies the local backend;
`TEST_APP_URL` can select an existing local frontend. See [testing](../testing/verification.md).

### `.github/`

`workflows/ci.yml` runs quality and native amd64/arm64 full-stack tests.
`rulesets/*.json` and `repository.json` record the admin-applied GitHub protection
and merge settings. See [CI and repository rules](../ci/checks-and-rules.md).

### `.claude/settings.json` and `.codex/config.toml`

Project-scoped plugin settings. Each lists only the plugins this project enables
(and, for Claude Code, the two marketplaces they come from); every other plugin
follows the user's own defaults. Claude Code enables Bun, PocketBase and TypeScript
LSP. Codex enables those plus Railway, frontend design and browser tooling. Review
them when the project starts or stops needing a plugin. Claude's
`.claude/settings.local.json` has higher precedence; Codex loads `.codex/config.toml`
only for a trusted project. Restart existing sessions after changing them. See the
[Codex plugin documentation](https://developers.openai.com/plugins/build/plugins)
and [Claude settings precedence](https://code.claude.com/docs/en/settings).

### `AGENTS.md`, `.agents/` and `scripts/ai-context.py`

`AGENTS.md` is the small instruction kernel every coding agent loads; Claude Code and
Codex both read it natively, so there is no `CLAUDE.md`. Task detail lives in short
topic pages under `.agents/context/` (build, maintain, improve), mapped in
`.agents/context/ai-context.json` and printed by
`python3 scripts/ai-context.py <topic>`. `python3 scripts/ai-context.py check` validates paths, headings, links,
orphans and byte budgets; the procedure is `.agents/context/ai-context.md`, indexed
in [`.agents/README.md`](../../.agents/README.md). `.agents/skills/` holds vendored
skills (shadcn) and is excluded from Biome and the docs link check.

### `playwright.performance.config.ts`

Runs the Chromium-only editor baseline against the local Docker production image,
without starting Vite. Reuses loopback safety checks and credentials from the main
Playwright config, but writes a separate performance report. `test:performance`
measures production loading; the main browser matrix covers Chromium and WebKit behavior (Firefox is deferred). See [verification](../testing/verification.md).

### Deployment env and signup flag

`deploy/railway/.env` is ignored and holds the operator's deployment credentials; nested
env files are also excluded from the Docker context. `VITE_SIGNUP_ENABLED` defaults
to false and must match at frontend build and PocketBase runtime. Docker accepts
it as a build argument; local Compose passes it as both argument and runtime env.
The public value controls the registration UI and `pb/hooks/signup.pb.js` enforces
it on registration requests. Existing users and superuser account creation remain
available. Deployment setup/check scripts are colocated under `deploy/railway/`.


### `scripts/tsconfig.json`

Type-checks operational and test scripts, including `deploy/railway/`. CI invokes
this separately from the frontend build. Deployment evidence output is selected
through `DEPLOY_EVIDENCE_DIR`; see the [backup runbook](../../deploy/OPERATIONS.md#backups).


### `deploy/railway/.env.example`

Template for deployment infrastructure and superuser credentials. Regular-user
credentials are managed separately. Verification creates temporary users or uses
a read-only restore comparison; see [accounts](../../deploy/OPERATIONS.md#accounts).
The scripts act on the `PB_URL` in the private copy and require its hostname to
be repeated (`CONFIRM` through `make`, `DEPLOY_CONFIRM` directly);
`deploy/railway/run.sh` is the wrapper the `make railway-*` targets call.

### `scripts/seed.sh` and `scripts/seed.ts`

The shell entry point forwards arguments to Bun. `make stack-seed` and `make app` run `seed.ts` in the stack's setup container instead. The implementation validates the
local target, creates missing accounts, verifies logins and seeds an empty notebook.
`--reset-passwords` explicitly permits changes to the configured seed passwords;
normal `make start`/`make seed` runs preserve them. `SEED_ARGS` forwards this option
through the Makefile. `scripts/seed-entries.ts` no longer creates accounts itself.
