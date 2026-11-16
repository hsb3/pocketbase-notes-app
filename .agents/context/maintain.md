# Maintain: dependencies, releases, deployments, CI

Use when keeping the project healthy rather than adding behaviour. Each step names the
maintain doc (listed below) that holds the procedure.

## Dependency and PocketBase bumps

- Bun packages: respect the 7-day `minimumReleaseAge` in `bunfig.toml`; Dependabot
  already waits eight days (CI). Keep `bun.lock` in the same change.
- PocketBase server and the `pocketbase` SDK bump together (Image § Updating
  PocketBase): edit the version and per-arch SHA-256 in `deploy/docker/Dockerfile`,
  bump the SDK in `package.json`, then `make codegen` against a running, seeded
  backend and commit `src/services/pocketbase-types.ts`. Dependabot ignores SDK
  minor/major bumps for this reason.
- After any bump run the full build and live tests from the `build` topic.

## Releases

- Follow Releasing § Cut a release: version in `package.json`, dated `CHANGELOG.md`
  section, `.github/scripts/release-notes.sh vX.Y.Z`, then tag the merge commit.
- Tagging and pushing a tag publishes a GitHub Release: only when the owner asks.
- Releasing does not deploy.

## Deploy operations and backups

- Railway deployment is owner-only. Use the `railway` CLI, never the Railway MCP.
  Read Railway for setup and Operations for everything after.
- Read-only checks: `make railway-check-backups`, `make railway-verify-restore`.
- Every other `make railway-*` target changes the deployment and refuses to run
  without `CONFIRM=<deployment hostname>`. Run one only when the owner asked for
  that action; take `make railway-backup` first before deploying a migration.
- Deploy target, credentials and evidence directory come from `deploy/railway/.env`
  and `DEPLOY_EVIDENCE_DIR` (Operations § Operator commands).

## CI

- `.github/workflows/ci.yml`: required `Quality`, `E2E (amd64)`, `E2E (arm64)`;
  also `Docs links` (lychee, offline, anchors) and `Workflow lint` (CI). The CI doc's
  "Running the checks locally" section has the exact local commands.
- Watch a PR with `gh pr checks --watch`. Fix the cause; never add retries or path
  exclusions to make a check pass.
- Repository rulesets and settings (`.github/rulesets/`, `.github/repository.json`)
  are admin-applied records: do not change them without the owner.
