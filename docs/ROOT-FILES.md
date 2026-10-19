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

Separate TS project for Node/Bun-context files — currently just `vite.config.ts`. Needed because the config file runs in a Node-like environment, not the browser, so it must not share the DOM-lib settings of the main tsconfig. Checked explicitly by the `build` script (`tsc -p tsconfig.node.json`).

## Code Quality

### `biome.json`

Biome formatter + linter config (replaces ESLint/Prettier). Defines the rule set, formatting style (2-space, 80-col, LF), Tailwind class sorting via `useSortedClasses`, and excludes generated files (`src/route-tree.gen.ts`, `src/services/pocketbase-types.ts`, `pb/`). Backs the `lint`/`lint:fix` scripts.

### `components.json`

Aliases explicitly route UI components and hooks into the existing `src/` folders; `iconLibrary` selects Tabler. The `registries` map includes `@prosekit` for discovering ProseKit editor components through the shadcn CLI. Registering it does not install an editor or its dependencies.

shadcn/ui CLI config. Tells `shadcn add <component>` where to put components (`@/components`), where the Tailwind CSS entry lives (`src/styles/globals.css`), and the base style. Only needed if you add/update shadcn components; harmless otherwise but the CLI won't work without it.

## Backend & Deployment

Deployment files live under `deploy/`, organized by target — see [`deploy/README.md`](../deploy/README.md).

### `deploy/docker/Dockerfile`

Two-stage build: (1) Bun image builds the frontend to `dist/`; (2) Alpine image downloads a pinned, SHA256-verified PocketBase binary (per-arch checksums, native amd64/arm64 via `TARGETARCH`) and serves the built frontend from `pb_public` alongside hooks and migrations. Produces the single production image — PocketBase serves both API and static frontend on port 8080. The PocketBase server version (0.40.x) is version-coupled to the `pocketbase` JS SDK (^0.28) in `package.json` — bump them together.

### `deploy/local/docker-compose.yml`

Standard local backend: builds the shared Dockerfile, mounts `pb/data`, `pb/hooks`, `pb/migrations` for persistence and live hook/migration editing, and requires `PB_ENCRYPTION_KEY` from `.env` (settings encryption). This is what `make up` runs (from the repo root, via `--project-directory .`).

### `deploy/local/docker-compose-full.yml`

Extended dev stack: PocketBase plus Mailpit (SMTP catcher for testing emails, UI on :8025) and MinIO (S3-compatible storage on :9000/:9001). Run with `make up-full` when developing email or file-storage features; otherwise the default compose file suffices.

### `deploy/railway/railway.json`

Railway config-as-code: Dockerfile builder pointing at `deploy/docker/Dockerfile`, healthcheck on `/api/health`, restart policy. Point the Railway service's config-as-code path at this file; the service also needs `PB_ENCRYPTION_KEY` and a volume at `/pb/pb_data`.

### `.dockerignore`

Keeps secrets (`.env`, `*.pem`, keys/certs), `node_modules`, `pb/data`, and build output out of the Docker build context. Necessary for security (no secrets baked into images) and fast builds.

## Environment & Workflow

### `.env.example`

Template for `.env`. Documents required (`PB_ENCRYPTION_KEY`) and dev-only variables (`VITE_PB_URL`, `PB_EMAIL`/`PB_PASSWORD` for codegen and seeding, `VITE_AUTH_BYPASS`). Committed so newcomers know what to set; the real `.env` is gitignored.

### `Makefile`

Task runner tying everything together: `make start` = backend up + seed + dev server; also `up`/`up-full`/`down`/`logs`/`health`/`seed`/`codegen`/`dev-solo`. Loads `.env` automatically and runs the compose files in `deploy/local/` with the repo root as project directory. Convenience layer — the canonical entry point for local development.

### `.gitignore`

Excludes build output, `node_modules`, secrets (`.env`, `*.pem`), PocketBase data (`pb/data`), and local agent/editor state from version control.

### `PRODUCT.md`

Product purpose, boundaries and links to the notes/journal design.

Agent-skill examples under `.agents/skills/` are excluded from Biome because they are vendored references, not application source. CLI scripts may report status through the console; application console warnings remain enabled.

The adopted prebuilt UI imports the ProseKit registry’s Tailwind icon plugin in
`src/styles/globals.css`; its Lucide icon data and React icons are installed dependencies.
Application controls retain their existing Tabler icons.
