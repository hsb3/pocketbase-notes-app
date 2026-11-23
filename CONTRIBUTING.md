# Working on PocketBase Notes

Use the [development setup](docs/development/setup.md) to start a local notebook. [AGENTS.md](AGENTS.md) lists project conventions, hard limits and task-specific guidance.

## How work flows

Track bugs and requests in [issues](https://github.com/hsb3/pocketbase-notes-app/issues). Start a feature, schema or API-rule change, or visible design change with a [spec](specs/). Bug fixes, dependency updates and documentation can go straight to a pull request.

The `functionform-gate` Spec Kit extension runs lint, knip and build when a Claude Code or Codex session stops (opencode has no stop event, so run those three yourself there), and adds the contained API and browser suites after `/speckit-implement` or `/speckit-functionform-gate-run`. Its commands are in `.specify/extensions/functionform-gate/functionform-gate-config.yml`.

Change `main` only through a pull request. Link the issue and any spec, and include the commands run and their results.

Split work into pull requests and commits this way:

- **One pull request per increment.** It holds the increment's spec folder and every wave, and it is squash-merged, so `main` gets one commit per increment.
- **Standalone changes get their own pull request first.** Research, constitution amendments and tooling that would stand on their own merge ahead of the increment that relies on them. The increment branch starts from that branch until it merges.
- **Inside a pull request, one commit per step.** The first commit holds the spec, plan and tasks. Then add one commit per wave, in order. Each wave commit passes its wave's exit checks, and its message names the wave and its task IDs (for example `W2 pin verb (T006–T009)`). Use the [verification guide](docs/testing/verification.md) for local checks and the [CI guide](docs/ci/checks-and-rules.md) for merge requirements.

Report security problems privately through the [security policy](SECURITY.md).
