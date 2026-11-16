# Contributing

Thanks for helping. This is a small, single-maintainer project; short, focused pull
requests are the easiest to review.

## Set up

You need [Bun](https://bun.sh) and Docker with Compose.

```sh
bun install
make start   # creates .env with generated secrets, PocketBase in Docker, seeded accounts, Vite
```

[docs/development/setup.md](docs/development/setup.md) covers the full stack (email and file
storage) and [AGENTS.md](AGENTS.md) lists the project's conventions and gotchas.

## How work flows

- **Issues are the inbox.** Report bugs and request features with the issue forms.
  Ideas waiting for a decision carry the `backlog` label.
- **Specs drive features.** A new feature, a schema or access-rule change, or a
  design change users would notice starts as a spec in `specs/NNN-short-name/`,
  written with [Spec Kit](https://github.com/github/spec-kit): `spec.md` (what and
  why), `plan.md` (how), `tasks.md` (steps). With Claude Code or Codex, run
  `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, then `/speckit-implement`.
  [specs/001-open-tasks](specs/001-open-tasks/spec.md) is a finished example.
- **Small changes skip the spec.** Bug fixes, dependency bumps, docs and tooling go
  straight to a pull request.
- The pull request links the spec, carries the verification evidence and closes the
  issue (`Closes #N`).

The project's principles are summarised in
[.specify/memory/constitution.md](.specify/memory/constitution.md); plans are checked
against it.

## Check your change

Run these before opening a pull request. CI's Quality job runs the same commands.

```sh
bun audit                              # known-vulnerable dependencies
bun test scripts/local-target.test.ts  # script safety guards
bun run lint                           # Biome: formatting and lint rules
bun run knip                           # unused files, exports and dependencies
python3 scripts/ai-context.py check    # agent docs: paths, links, size budgets
bunx tsc -p scripts/tsconfig.json      # script types
bun run build                          # app and config type checks, production build
```

If you changed docs, also run `bun run docs:build` (fails on a broken link) and the
link check in [CI and repository rules](docs/ci/checks-and-rules.md).

For changes to behavior, also run the browser and API suite against the local stack:

```sh
bun run test:install   # once: install the test browsers
make up-full
make e2e
```

[docs/testing/verification.md](docs/testing/verification.md) describes what the suite covers.

## Rules of the road

- `main` only changes through pull requests. Branch from `main`, push, and open a PR.
  The three required checks (`Quality`, `E2E (amd64)`, `E2E (arm64)`) must pass and
  review threads must be resolved. PRs are squash-merged.
- To update a PR branch, merge `main` into it. Force pushes are blocked.
- Never hand-edit generated files: `src/route-tree.gen.ts` and
  `src/services/pocketbase-types.ts`.
- New dependencies need a reason in the PR description. `bunfig.toml` refuses package
  versions published less than seven days ago; keep that setting.
- Add a line under `Unreleased` in [CHANGELOG.md](CHANGELOG.md) for changes users or
  operators would notice.
- Never commit secrets, `.env` files or real user data.

Releases are cut by the maintainer; see [docs/ci/releasing.md](docs/ci/releasing.md).

## Reporting problems

Use the issue forms for bugs and feature requests. Report security problems privately
as described in [SECURITY.md](SECURITY.md), not in a public issue.

By contributing you agree that your work is released under the [MIT License](LICENSE).
