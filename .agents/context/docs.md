# Human docs map

Every human doc an agent topic points at, listed once so a rename is one edit here.
Topic pages name a doc by its label; follow the link from this page. Read only the
doc your step needs.

## Build docs

| Label | Doc | Read it for |
|---|---|---|
| Contributing | [CONTRIBUTING.md](../../CONTRIBUTING.md) | Setup, pre-PR checks, rules of the road |
| Development | [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) | `make app` / `make start` / `make start-full`, seeding |
| Local stacks | [deploy/LOCAL.md](../../deploy/LOCAL.md) | Compose files, named `STACK` instances, ports |
| Verification | [docs/VERIFICATION.md](../../docs/VERIFICATION.md) | Test commands, coverage, debugging failures |
| Root files | [docs/ROOT-FILES.md](../../docs/ROOT-FILES.md) | What each root config file does |

## Maintain docs

| Label | Doc | Read it for |
|---|---|---|
| Image | [deploy/IMAGE.md](../../deploy/IMAGE.md) | Dockerfile stages, updating PocketBase |
| Releasing | [docs/RELEASING.md](../../docs/RELEASING.md) | Versions, changelog, cutting a release |
| CI | [docs/CI.md](../../docs/CI.md) | Required checks, other workflows, Dependabot, branch rules |
| Deployment | [deploy/README.md](../../deploy/README.md) | Deployment overview and file layout |
| Railway | [deploy/RAILWAY.md](../../deploy/RAILWAY.md) | First-time Railway setup |
| Operations | [deploy/OPERATIONS.md](../../deploy/OPERATIONS.md) | Operator commands, updates, rollback, backups, accounts |

## Improve docs

| Label | Doc | Read it for |
|---|---|---|
| Spec | [docs/SPEC.md](../../docs/SPEC.md) | Product purpose and boundaries |
| Designs | [docs/design/](../../docs/design/notes-journal.md) | Feature designs (one file per feature) |
| Attachments | [docs/ATTACHMENTS.md](../../docs/ATTACHMENTS.md) | Editor attachments, storage, access |
| Verification | [docs/VERIFICATION.md](../../docs/VERIFICATION.md) | Where new tests go and what they cover |

Planned on other branches, not yet on `main` (add a row when they land): `docs/AUTH.md`
(MFA), `docs/TASKS.md` (tasks view), `docs/LOAD-TESTING.md`, and a docs site that may
rename `docs/*.md` to lowercase kebab-case.
