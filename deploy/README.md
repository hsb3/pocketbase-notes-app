# deploy/

Deployment targets. All share one multi-arch image definition.

```
docker/Dockerfile              shared image (frontend build + PocketBase); native arm64/amd64
local/docker-compose.yml       local backend (PocketBase only)         -> make up
local/docker-compose-full.yml  local full stack (+ Mailpit, MinIO)     -> make up-full
railway/railway.json           Railway config-as-code
```

## Local

Compose files are driven through the Makefile from the repo root, which passes
`--project-directory .` so `.env` and relative volume paths (`./pb/...`) resolve
against the root as before. `make up-full` waits for healthy services, creates the
MinIO bucket, and configures local SMTP/S3 settings. See [development setup](../docs/DEVELOPMENT.md)
for `make start-full` and the live `make check-services` verification.

## Railway

Railway looks for `railway.json` at the repo root by default. Since ours lives
here, point the service at it once, in the service settings:

- **Settings → Config-as-code file path**: `deploy/railway/railway.json`

That file sets the Dockerfile path, healthcheck (`/api/health`), and restart
policy. Also required on the service:

- **Variables**: `PB_ENCRYPTION_KEY` (generate with `openssl rand -base64 24`)
- **Volume** mounted at `/pb/pb_data` (PocketBase state is on-disk; without a
  volume all data is lost on every deploy)

The image serves both the API and the built frontend on port 8080.

## Version coupling

The PocketBase server version is pinned (with per-arch SHA256) in
`docker/Dockerfile`. Server 0.40.x pairs with the `pocketbase` JS SDK ^0.28
in `package.json` — bump both together, and regenerate types afterwards
(`make codegen`).
