# Contributing

Thanks for helping. This is a small, single-maintainer project; short, focused pull
requests are the easiest to review.

## Set up

You need [Bun](https://bun.sh) and Docker with Compose.

```sh
bun install
cp .env.example .env   # then set PB_ENCRYPTION_KEY and the superuser credentials
make start             # PocketBase in Docker, seeded accounts, Vite dev server
```

[docs/development/setup.md](docs/development/setup.md) covers the full stack (email and file
storage) and [AGENTS.md](AGENTS.md) lists the project's conventions and gotchas.

## Check your change

Run these before opening a pull request. CI runs the same commands.

```sh
bun run lint    # Biome: formatting and lint rules
bun run knip    # unused files, exports and dependencies
bun run build   # type checks and the production build
```

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
