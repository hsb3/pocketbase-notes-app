# Changelog

Notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). How releases are cut is
described in [docs/ci/releasing.md](docs/ci/releasing.md).

## [Unreleased]

### Added

- Documentation site built with VitePress (`bun run docs:build`) and deployed to
  GitHub Pages from `main`; `docs/` reorganized into lowercase sections, with a new
  tech stack page and wireframe images viewable on GitHub.
- Open tasks: unchecked checklist items across your entries in one view, ticked off
  in place through the normal save-conflict check, with per-entry open counts.
  Counts are derived on the server and backfilled for existing entries.

## [0.1.0] - 2026-11-15

First versioned state of the app: a private notes and journaling app on React,
TanStack Router, PocketBase and ProseKit, with a Docker image, local stacks and a
Railway deployment runbook.

### Added

- Required CI for every pull request to `main`: a `Quality` job and full-stack
  end-to-end tests on Linux amd64 and arm64. `main` only changes through pull
  requests. ([#1])
- Railway deployment setup, verification scripts and runbook; an editor loading
  benchmark; WebKit browser coverage. ([#2])
- Public signup is off by default (`VITE_SIGNUP_ENABLED`); while it is off only
  superusers can create accounts. ([#2])
- A PocketBase admin link in the account menu. ([#2])
- Self-contained local stacks (`make stack-up STACK=<name>`) that run from a baked
  image and named volumes instead of the checkout. ([#4])
- A read-only check that scheduled backups are fresh. ([#10])
- MIT license, contributing guide, security policy, issue forms and a pull request
  template.
- Unused-code checks (knip), offline documentation link checks, workflow linting,
  CodeQL scanning, Dependabot updates and a tag-driven release workflow.

### Changed

- The admin link is shown only to accounts the server confirms belong to an
  administrator. ([#10])
- Local seeding keeps existing passwords and profile fields unless
  `--reset-passwords` is given, and refuses remote targets. ([#14])
- Deployment checks create and remove their own temporary accounts instead of
  relying on a saved personal password; infrastructure setup no longer creates a
  regular user. ([#14])

### Fixed

- Saving waits for the route refresh before reporting success. ([#2])
- Login return URLs can no longer send the browser outside the app. ([#10])
- Login, registration and password-reset forms stay pending until the request
  finishes and show failures; email verification can be retried without creating a
  second account. ([#10])
- API tests reject non-local targets before sending credentials. ([#10])

### Security

- Updated dependencies flagged by `bun audit`, and added the audit to CI. ([#10])

[Unreleased]: https://github.com/hsb3/pocketbase-notes-app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hsb3/pocketbase-notes-app/releases/tag/v0.1.0
[#1]: https://github.com/hsb3/pocketbase-notes-app/pull/1
[#2]: https://github.com/hsb3/pocketbase-notes-app/pull/2
[#4]: https://github.com/hsb3/pocketbase-notes-app/pull/4
[#10]: https://github.com/hsb3/pocketbase-notes-app/pull/10
[#14]: https://github.com/hsb3/pocketbase-notes-app/pull/14
