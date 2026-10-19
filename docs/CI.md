# CI and repository rules

## Checks

GitHub Actions runs `.github/workflows/ci.yml` on every pull request targeting
`main`, every push to `main`, and manual dispatch. Required jobs are:

| Check | Work |
| --- | --- |
| `Quality` | Frozen dependency install, Biome, setup/test-script type checks, frontend/config type checks and production build |
| `E2E (amd64)` | Native Ubuntu Docker build, fresh PocketBase + Mailpit + RustFS, live API tests and Chromium browser scenarios |
| `E2E (arm64)` | The same full-stack checks on native ARM Linux |

E2E jobs run only after Quality passes. Both architectures must pass. The complete
suite includes the smoke scenario; no duplicate smoke job is needed. Workflow/job
timeouts bound stalled runs; newer runs cancel older runs for the same PR or branch.
There are no path exclusions or automatic test retries.

Each hosted runner creates a fresh `.env` with random development credentials,
initializes its own database and bucket, and destroys its services afterward.
No repository secrets, production data or deployed backend are used. Playwright
starts its own Vite server with auth bypass disabled. The Docker image is built as
part of full-stack startup, including fresh migrations and S3 configuration.

Actions are pinned by commit SHA; Node and Bun versions are explicit. The token has
read-only contents permission and checkout does not retain Git credentials. The
workflow uses `pull_request`, not `pull_request_target`, so fork code does not receive
privileged credentials. No deployment or package publishing happens in CI.

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
Reproduce with the [local testing commands](VERIFICATION.md). When updating action
SHAs, runtimes or image digests, require a new green run on both architectures.
