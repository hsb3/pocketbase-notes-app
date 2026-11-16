# Human docs map

Every human doc an agent topic points at, listed once so a rename is one edit here.
Topic pages name a doc by its label; follow the link from this page. Read only the
doc your step needs.

## Build docs

| Label | Doc | Read it for |
|---|---|---|
| Contributing | [CONTRIBUTING.md](../../CONTRIBUTING.md) | Setup, pre-PR checks, rules of the road |
| Development | [docs/development/setup.md](../../docs/development/setup.md) | `make app` / `make start` / `make start-full`, seeding |
| Local stacks | [deploy/LOCAL.md](../../deploy/LOCAL.md) | Compose files, named `STACK` instances, ports |
| Verification | [docs/testing/verification.md](../../docs/testing/verification.md) | Test commands, coverage, debugging failures |
| Root files | [docs/development/root-files.md](../../docs/development/root-files.md) | What each root config file does |
| Docs site | [docs/development/root-files.md](../../docs/development/root-files.md#vitepressconfigts) | `bun run docs:build` (VitePress, `.vitepress/config.ts`); dead links fail it |

## Maintain docs

| Label | Doc | Read it for |
|---|---|---|
| Image | [deploy/IMAGE.md](../../deploy/IMAGE.md) | Dockerfile stages, updating PocketBase |
| Releasing | [docs/ci/releasing.md](../../docs/ci/releasing.md) | Versions, changelog, cutting a release |
| CI | [docs/ci/checks-and-rules.md](../../docs/ci/checks-and-rules.md) | Required checks, other workflows, Dependabot, branch rules |
| Deployment | [deploy/README.md](../../deploy/README.md) | Deployment overview and file layout |
| Railway | [deploy/RAILWAY.md](../../deploy/RAILWAY.md) | First-time Railway setup |
| Operations | [deploy/OPERATIONS.md](../../deploy/OPERATIONS.md) | Operator commands, updates, rollback, backups, accounts |

## Improve docs

| Label | Doc | Read it for |
|---|---|---|
| Tech stack | [docs/architecture/tech-stack.md](../../docs/architecture/tech-stack.md) | What each piece is and why; architecture diagram |
| Spec | [docs/architecture/spec.md](../../docs/architecture/spec.md) | Product purpose and boundaries |
| Designs | [docs/design/](../../docs/design/notes-journal.md) | Feature designs (one file per feature) |
| Attachments | [docs/features/attachments.md](../../docs/features/attachments.md) | Editor attachments, storage, access |
| Tasks | [docs/features/tasks.md](../../docs/features/tasks.md) | Open tasks view, server-derived task index |
| Verification | [docs/testing/verification.md](../../docs/testing/verification.md) | Where new tests go and what they cover |
| Load testing | [docs/testing/load-testing.md](../../docs/testing/load-testing.md) | `tests/load/run.sh`, measured capacity of one instance, method limits |

Planned on other branches, not yet on `main` (add a row when they land):
`docs/features/auth.md` (MFA). New human docs go under `docs/<section>/` in lowercase
kebab-case; add them to the sidebar in `.vitepress/config.ts`. Pages compile as Vue templates: keep
`<tags>` and `{{ }}` inside code spans that do not start a line.
