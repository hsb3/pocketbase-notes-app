# Changelog

Notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). How releases are cut is
described in [docs/ci/releasing.md](docs/ci/releasing.md).

## [Unreleased]

### Added

- An open note and the visible lists follow saves, moves, pins, deletes and restores made on another device or tab, without a reload. A clean note takes the newer version, unsaved words get the conflict dialog at once, and a move elsewhere no longer causes a false conflict. Returning to the tab or reconnecting catches up. [Live updates, issue 68](https://github.com/hsb3/pocketbase-notes-app/issues/68)

- Pin a note to the top of its folder and All Notes, and see every pinned note in the new Pinned view. A pin never changes the note's last-edit time and never causes a save conflict on another device. [Pin, issue 42](https://github.com/hsb3/pocketbase-notes-app/issues/42)

- Move a saved note without losing its place in the editor. Delete a note or a custom folder and restore its notes and attachments from Recently Deleted for 30 days. Removed folders stay removed. [Move, delete and recover notes, issue 40](https://github.com/hsb3/pocketbase-notes-app/issues/40)

- Search titles and body text across all private folders. Results show the actual folder and highlight the match. Back restores the result page. [Search across folders, issue 39](https://github.com/hsb3/pocketbase-notes-app/issues/39)

- Notes retain unsaved writing in the open tab after a failed save or expired session. Retry saves the latest edits. Conflicts allow copying a draft before replacing it, and signing out with unsaved edits offers a choice to save, discard or keep editing.

- The [notebook](docs/features/notes.md) opens in All Notes. Create a folder, compose in one writing surface and autosave edits. Phone navigation restores the list position. Wider screens show folders, notes and editor together.

- Run the API or Chromium/WebKit suite in a disposable Docker stack with
  `make test-api-contained` or `make test-browser-contained`.

- Spec Kit drives feature work: specs live under `specs/`, the `speckit-*` skills are
  installed for Claude Code and Codex, and GitHub issues stay the inbox ([#33] is the
  first backlog item).

### Changed

- The Milestone 1 verification gate now checks capture and body search across three widths and both themes, account isolation, draft recovery and signup mode. A dedicated Linux amd64 CI job covers note ageing. The notebook and folder guides and README screenshots now show the current app. [Milestone 1 coverage](specs/002-notes-redesign/r6-gate/coverage.md)

- The upgrade provisions a permanent Notes folder for existing accounts and drops the legacy entries collection. Take a pre-upgrade backup to recover legacy data. Favorites, dated journals, Open Tasks and attachment controls are absent from this increment. Existing note documents and protected attachment references remain supported.
- The search migration repairs affected comparison keys, including those on deleted notes, and adds an index for paging results. Note content, revisions and dates are preserved.
- The restore test's temporary container runs with CPU, memory and process limits,
  and Biome skips locally synced `.claude/skills/`.
- The `make railway-verify-*` scripts wait and retry when the deployment's
  rate limit answers 429.
- GitHub Actions bumped (`actions/checkout`, `actions/setup-node`,
  `actions/upload-artifact`).

## [0.1.0] - 2026-11-16

First versioned state of the app: a private notes and journaling app on React,
TanStack Router, PocketBase and ProseKit, shipped as one Docker image, with local
stacks and a Railway self-host guide.

### Added

- Notes and dated journal entries in a ProseKit editor, title search, favorites
  and journal date filters, explicit saves with conflict detection, and private
  image, PDF and text attachments.
- Open tasks: unchecked checklist items across your entries in one view, ticked off
  in place through the normal save-conflict check, with per-entry open counts.
  Counts are derived on the server and backfilled for existing entries; see
  [docs/features/tasks.md](docs/features/tasks.md). ([#23])
- Opt-in two-step sign-in: after the password (or OAuth2), an emailed one-time code.
  Turned on and off from Account security with the current password; see
  [docs/features/auth.md](docs/features/auth.md). ([#21])
- Light, dark and system theme, chosen from the login page or the user menu, with
  no flash of the wrong theme on load. ([#20])
- `make app`: the whole app in Docker, configured and seeded, in one command with
  no Bun on the host. `.env` and its secrets are generated when missing. ([#16])
- Self-contained local stacks (`make app STACK=<name>`) that run from a baked
  image and named volumes instead of the checkout. ([#4], [#16])
- Railway self-host guide and operations runbook, and `make railway-*` operator
  targets; the mutating ones refuse to run without `CONFIRM=<hostname>`. ([#2], [#16])
- Public signup is off by default (`VITE_SIGNUP_ENABLED`); while it is off only
  superusers can create accounts. ([#2])
- A PocketBase admin link in the account menu. ([#2])
- A read-only check that scheduled backups are fresh. ([#10])
- Documentation site built with VitePress (`bun run docs:build`) and deployed to
  GitHub Pages from `main`, with a tech stack page and wireframe images. ([#24])
- MIT license, contributing guide, security policy, issue forms and a pull request
  template. ([#15])
- Required CI for every pull request to `main`: a `Quality` job and full-stack
  end-to-end tests on Linux amd64 and arm64, plus unused-code checks (knip),
  offline documentation link checks, workflow linting, CodeQL scanning, Dependabot
  updates, a manual editor benchmark and a tag-driven release workflow.
  ([#1], [#2], [#15])
- Agent instructions split into a small `AGENTS.md` and task topics loaded on
  demand (`python3 scripts/ai-context.py`), checked in CI. ([#22])
- Load test that runs entirely in Docker (`make load-test`: capped app stack plus
  k6), with measured capacity of one instance in
  [docs/testing/load-testing.md](docs/testing/load-testing.md). ([#28])

### Changed

- README rewritten around what you get and how to run it, with screenshots and a
  short recording captured by `scripts/capture-screenshots.sh`. ([#25])
- `docs/` reorganized into lowercase sections; deployment docs split into local
  stacks, image, Railway and operations pages. ([#16], [#24])
- The admin link is shown only to accounts the server confirms belong to an
  administrator. ([#10])
- Local seeding keeps existing passwords and profile fields unless
  `--reset-passwords` is given, and refuses remote targets. ([#14])
- Deployment checks create and remove their own temporary accounts instead of
  relying on a saved personal password; infrastructure setup no longer creates a
  regular user. ([#14])
- Railway operator scripts take their target and sender address from the private
  `deploy/railway/.env` instead of a built-in instance; existing operator files
  need `PB_SENDER_ADDRESS`. ([#16])
- `make railway-configure` makes rate limits count per visitor by trusting
  Railway's `X-Real-IP` header (`PB_TRUSTED_PROXY_HEADERS`); before, every visitor
  shared the edge's address. Check it once on a live instance; see
  [deploy/OPERATIONS.md](deploy/OPERATIONS.md#client-addresses-and-rate-limits). ([#27])
- Dependencies updated (React 19.3, TanStack Router 1.170.46, Biome 2.6, Vite 8.3,
  Playwright 1.65). ([#26])

### Fixed

- Long entry titles wrap on phones instead of being cut off. ([#26])
- Saving waits for the route refresh before reporting success. ([#2])
- Login return URLs can no longer send the browser outside the app. ([#10])
- Login, registration and password-reset forms stay pending until the request
  finishes and show failures; email verification can be retried without creating a
  second account. ([#10])
- API tests reject non-local targets before sending credentials. ([#10])
- OAuth profile sync no longer stores an error page as the avatar. ([#15])
- Error text and code blocks are readable in the dark theme. ([#20])

### Security

- Updated dependencies flagged by `bun audit`, and added the audit to CI. ([#10])

[Unreleased]: https://github.com/hsb3/pocketbase-notes-app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hsb3/pocketbase-notes-app/releases/tag/v0.1.0
[#1]: https://github.com/hsb3/pocketbase-notes-app/pull/1
[#2]: https://github.com/hsb3/pocketbase-notes-app/pull/2
[#4]: https://github.com/hsb3/pocketbase-notes-app/pull/4
[#10]: https://github.com/hsb3/pocketbase-notes-app/pull/10
[#14]: https://github.com/hsb3/pocketbase-notes-app/pull/14
[#15]: https://github.com/hsb3/pocketbase-notes-app/pull/15
[#16]: https://github.com/hsb3/pocketbase-notes-app/pull/16
[#20]: https://github.com/hsb3/pocketbase-notes-app/pull/20
[#21]: https://github.com/hsb3/pocketbase-notes-app/pull/21
[#22]: https://github.com/hsb3/pocketbase-notes-app/pull/22
[#23]: https://github.com/hsb3/pocketbase-notes-app/pull/23
[#24]: https://github.com/hsb3/pocketbase-notes-app/pull/24
[#25]: https://github.com/hsb3/pocketbase-notes-app/pull/25
[#26]: https://github.com/hsb3/pocketbase-notes-app/pull/26
[#27]: https://github.com/hsb3/pocketbase-notes-app/pull/27
[#28]: https://github.com/hsb3/pocketbase-notes-app/pull/28
[#33]: https://github.com/hsb3/pocketbase-notes-app/issues/33
