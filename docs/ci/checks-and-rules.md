# CI and repository rules

## Checks

GitHub Actions runs `.github/workflows/ci.yml` on every pull request targeting
`main`, every push to `main`, and manual dispatch. Required jobs are:

| Check | Work |
| --- | --- |
| `Quality` | Frozen dependency install, dependency audit, local-target safety tests, Biome, unused-code check (knip), agent-context check (`scripts/ai-context.py check`), setup/test-script type checks, frontend/config type checks and production build |
| `E2E (amd64)` | Native Ubuntu Docker build, fresh PocketBase + Mailpit + RustFS, live API tests and Chromium and WebKit browser scenarios |

E2E runs on amd64 only, because that is the architecture the app is deployed on. The
arm64 image used for local development on Apple Silicon is built and booted by the
contained gates (`make test-api-contained`, `make test-browser-contained`).

Three more jobs in the same workflow run on every pull request but are not required
by the ruleset:

| Check | Work |
| --- | --- |
| `Recover (amd64)` | Run both recovery suites against a contained stack with the ageing fixture, including the 12 cases excluded from plain E2E. Keep discovery and execution JSON in `recover-amd64/recover/`. Adding this job to the required ruleset is an owner decision. |
| `Docs links` | lychee in offline mode checks relative links and heading anchors in Markdown outside the vendored skill trees and `.specify/templates/`. External URLs are not fetched, so other sites cannot fail it |
| `Workflow lint` | actionlint over `.github/workflows/`, run from a digest-pinned image with no network |

E2E and Recover run in parallel on Linux amd64 after Quality passes. Each has a 40-minute job limit including setup and artifact upload. The E2E suite includes the smoke scenario. Newer runs cancel older runs for the same PR or branch.
There are no path exclusions or automatic test retries.

Each hosted runner creates a fresh `.env` with random development credentials,
initializes its own database and bucket, and destroys its services afterward.
No repository secrets, production data or deployed backend are used. The default browser phase sets `TEST_APP_URL=http://127.0.0.1:8080` so Playwright reaches the PocketBase-served production bundle. The warm Compose check observes that bundle’s editor chunk. The plain suite selects the default-disabled tests and excludes the two fixture-dependent `@ageing` leaves at discovery. After that suite, CI exercises account seeding, deployment-fixture cleanup and an isolated
archive restore. CI then explicitly enables signup on the disposable backend and runs the
registration retry scenario with the matching frontend flag and the mode-bound MFA audit. The HTML report is written under `playwright-report/signup-enabled`. The `test-results-amd64` archive contains the discovery and execution pairs under `plain/` and `signup/`. The R6 coordinator compares all three hosted pairs with the accepted local full report on both dispatch and PR runs. The Docker image is built as
part of full-stack startup, including fresh migrations and S3 configuration.

Local acceptance uses separate [contained targets](../testing/verification.md#disposable-docker-gates) with Chromium and WebKit, plus isolated account, restore and operator drills. The hosted jobs keep their own full-stack setup. The local draft unit suite runs with `bun test tests/unit`.

Actions are pinned by commit SHA; Node and Bun versions are explicit. The token has
read-only contents permission and checkout does not retain Git credentials. The
workflow uses `pull_request`, not `pull_request_target`, so fork code does not receive
privileged credentials. No deployment or package publishing happens in CI.

## Other workflows

| Workflow | Runs | Work |
| --- | --- | --- |
| `codeql.yml` | Pull requests to `main`, pushes to `main`, Mondays 06:23 UTC | CodeQL analysis of JavaScript/TypeScript. Results appear under Security → Code scanning. Only this job holds `security-events: write` |
| `release.yml` | Push of a `v*` tag | Checks the tag against `package.json` and `CHANGELOG.md`, then creates a GitHub Release. Only this job holds `contents: write`. See [releasing](releasing.md) |
| `docs.yml` | Pull requests to `main`, pushes to `main`, manual dispatch | Builds the VitePress docs site with `bun run docs:build`, which fails on dead links. On `main` only, a separate job deploys it to GitHub Pages; only that job holds `pages: write` and `id-token: write` |
| `performance.yml` | Manual dispatch only | Runs the [editor benchmark](../testing/verification.md#production-editor-performance) against the production image and uploads the report for 30 days. It is not part of pull request CI: it takes minutes, shared-runner timings are noisy, and no budget is enforced |

`.github/dependabot.yml` opens weekly grouped pull requests for GitHub Actions pins
and for Bun dependencies. Bun updates wait eight days after a version is published,
so they clear the seven-day `minimumReleaseAge` in `bunfig.toml`. Minor and major
updates of the `pocketbase` SDK are ignored because it is bumped together with the
server image (see `AGENTS.md`). Dependabot pull requests go through the same required
checks as any other.

### Running the checks locally

```sh
bun run knip
python3 scripts/ai-context.py check
bun run docs:build
actionlint
docker run --rm --network none -v "$PWD:/repo:ro" -w /repo lycheeverse/lychee:latest \
  --offline --include-fragments --no-progress --exclude-path .agents/skills --exclude-path .claude/skills --exclude-path .opencode/commands --exclude-path .specify/templates --exclude-path node_modules '**/*.md'
.github/scripts/release-notes.sh "v$(jq -r .version package.json)"
```

`knip.json` lists the entry points knip cannot infer (file routes, scripts, deployment
helpers, tests) and silences unused-export reports for the vendored shadcn and ProseKit
component folders; unused files and dependencies are still reported everywhere.

Reports, failure traces/screenshots and service logs are uploaded per architecture
with seven-day retention, including on test failure. `.env`, database files and TLS
keys are excluded. Traces can contain temporary test credentials; these only grant
access to the disposed local runner. Artifacts from public repository runs are
visible to repository readers.

## Main branch policy

GitHub rulesets apply to administrators as well as collaborators, with no bypass
actors:

- `main` changes require a pull request and all required checks from GitHub Actions.
- PR branches must be up to date with `main` before merging.
- Review threads must be resolved. Approvals are invalidated after new commits.
- No independent approval is required for this single-maintainer repository; the
  PR requirement still applies. Raise the approval count when adding reviewers.
- `main` cannot be deleted. Force pushes are blocked on every branch.
- Squash is the only enabled merge method. Merged head branches are deleted
  automatically; GitHub can update an out-of-date PR branch with a regular merge.

Use a feature branch, push normally and open a PR. To update it, merge `origin/main`
into the feature branch and push; do not rebase already-published commits or force push.

## Configuration source and maintenance

`.github/rulesets/main.json` and `no-force-push.json` describe the active rulesets.
`.github/repository.json` records the merge/branch settings. These files document
admin-applied GitHub API configuration; Actions does not apply them or hold an admin
token. Changes must be applied explicitly and read back from GitHub after review.

```sh
gh api repos/hsb3/pocketbase-notes-app/rulesets
gh api repos/hsb3/pocketbase-notes-app/rules/branches/main
gh api repos/hsb3/pocketbase-notes-app/rules/branches/example-feature
```

Update a ruleset with `gh api --method PUT` on its returned
`repos/hsb3/pocketbase-notes-app/rulesets/<id>` endpoint and `--input` pointing at the
reviewed JSON file. Repository settings use `gh api --method PATCH` on
`repos/hsb3/pocketbase-notes-app` with `--input .github/repository.json`.
Required check names must stay aligned with the workflow job names; checks are
bound to the GitHub Actions integration rather than arbitrary commit statuses.

For a failure, inspect the failed job first, then download its report/log artifact.
Reproduce with the [local testing commands](../testing/verification.md). When updating action
SHAs, runtimes or image digests, require a new green run of the amd64 jobs.
Dependabot proposes action SHA updates; the actionlint image digest and the lychee
version in `ci.yml` are bumped by hand.
