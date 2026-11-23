# Agent context

Instructions for coding agents (Claude Code, Codex and others). Every agent loads the
root [`AGENTS.md`](../AGENTS.md) kernel; task detail lives in routed topics under
[`context/`](context/docs.md), mapped in `context/ai-context.json` and printed with
`python3 scripts/ai-context.py <topic>`. Humans should start at the
[README](../README.md) and [CONTRIBUTING.md](../CONTRIBUTING.md) instead.

## Task routing

| Topic | Use when | Main sources |
|---|---|---|
| `build` | Setting up, running or testing the app locally | `context/build.md`, `context/docs.md` (the `Build docs` section) |
| `maintain` | Dependency or PocketBase bumps, releases, deploy operations, backups, CI | `context/maintain.md`, `context/docs.md` (the `Maintain docs` section) |
| `improve` | Adding a feature, changing the schema or API rules, UI work | `context/feature-workflow.md`, `context/docs.md` (the `Improve docs` section) |
| `ai-context` | Maintaining this router: add, move or split docs, fix `check` | `context/ai-context.md` |
| `ai-context-advanced` | Shared router install or mounting another router tree | `context/ai-context-advanced.md` |

`context/ai-context.json` owns these topics; this table mirrors them for humans. After
changing topics, run `python3 scripts/ai-context.py check`.

`skills/` holds vendored skills (shadcn) and the spec-kit `speckit-*` skills for Codex
(Claude's copies are in `.claude/skills/`, opencode's commands in `.opencode/commands/`);
they are adapters, not a source of rules.
The spec-kit workflow is described in `context/feature-workflow.md`.

## History (milestone logs; read on demand)

| File | Contents |
|---|---|
| _none yet_ | Milestone logs go in `context/history/` with a row here |
