# Shared image

Every target runs the same image: the built frontend, PocketBase, hooks and
migrations. Build it from the repository root:

```sh
docker build -f deploy/docker/Dockerfile -t pocketbase-notes-app .
```

## Stages

| Stage | Contents | Used by |
| --- | --- | --- |
| `deps` | Bun and the frozen-lockfile install | The two stages below |
| `tools` | `deps` plus `scripts/` | The `setup` service of the self-contained stack |
| `frontend-build` | Type-checks `src/` and runs the Vite build | The runtime stage |
| runtime (default) | Alpine, checksum-verified PocketBase, hooks, migrations, frontend | Local stacks, Railway |

`tools` is built only when a Compose file asks for it; a plain `docker build`
or a Railway deploy produces the runtime stage. The frontend stage checks the
application sources only. `bun run build` on the host and in CI also checks the
Vite and Playwright configs through `tsconfig.node.json`.

## Runtime contract

- Listens on `0.0.0.0:8080`; the health check requests `/api/health`.
- Working directory is `/pb`. Persist `/pb/pb_data`: it holds the database and,
  unless S3 storage is configured, attachment files.
- `PB_ENCRYPTION_KEY` is required: exactly 32 characters, stable for the life
  of the data.
- Migrations run at startup. Take a backup before an upgrade and keep the prior
  image. Rolling back the image alone does not undo a migration.
- The frontend calls the API on its own origin. Runtime `VITE_*` variables do
  not change an already-built frontend, and the development auth bypass is
  compiled out.

## Signup switch

`VITE_SIGNUP_ENABLED` defaults to `false` as both a build argument and a
runtime variable. The build value hides or shows the registration form; the
runtime value makes the PocketBase hooks reject or accept public account
creation and new OAuth accounts. Set both to the exact value `true`, and
rebuild, to open signup. Existing logins and superuser-created accounts work
either way.

## Updating PocketBase

The server version and its per-architecture SHA-256 checksums are pinned in the
Dockerfile, and base images are pinned by digest. Bump the server together with
the `pocketbase` package in `package.json`, then run `make codegen`.

The Dockerfile uses ordinary layer caching, not BuildKit cache mounts: Railway
rejects cache mounts that use generic IDs.
