# Deployment

All targets use the shared frontend + PocketBase image. Run commands from the
repository root; Docker's build context must remain the root, not `deploy/`.

| File | Purpose |
| --- | --- |
| `docker/Dockerfile` | Native arm64/amd64 build; serves frontend and API |
| `local/docker-compose.yml` | PocketBase only: `make up` |
| `local/docker-compose-full.yml` | PocketBase, Mailpit and RustFS: `make up-full` |
| `local/docker-compose-stack.yml` | Self-contained named stack, no checkout mounts: `make stack-up STACK=<name>` |
| `railway/railway.json` | Railway build path, readiness check and restart policy |

## Local development

Copy `.env.example` to `.env`, generate `PB_ENCRYPTION_KEY`, set local superuser
credentials, and keep `VITE_PB_URL` aligned with `PB_PORT`. `make start` starts the
backend, seeds development accounts and starts Vite. `make start-full` additionally
configures local email and storage. Seeding resets the configured development
accounts' passwords; never run it against production.

The Makefile supplies `--project-directory .` so Compose mounts resolve correctly.
All published local service ports bind to loopback. PocketBase data lives in
`pb/data`; Mailpit messages and RustFS files live in named Docker volumes. Hooks and
migrations are mounted for development. The full stack mounts development scripts
and certificates read-only and forwards termination directly to PocketBase.

`make up-full` waits for healthy services, initializes the bucket and persists
SMTP/S3 settings in PocketBase. Afterward, keep using the full stack: `make up`
does not revert those settings or trust the Mailpit certificate. Changing a bucket
name does not migrate files. See [full-stack setup](../docs/DEVELOPMENT.md#full-stack-mailpit-smtp--rustfs-s3)
and [attachment storage](../docs/ATTACHMENTS.md).

Stop with `make down` or `make down-full`; do not use `docker compose down -v`
unless deleting the Mailpit/RustFS data is intended.

### Self-contained stacks

The dev stacks above bind-mount the checkout, so moving, renaming or switching
the repo changes what a running container sees. `make stack-up STACK=<name>`
instead builds an image with the frontend, hooks and migrations baked in and keeps
PocketBase data, Mailpit messages, RustFS files and the Mailpit certificate in
`<name>_*` volumes. It serves the built app and API together on `STACK_PORT`.

```sh
make stack-up STACK=demo                      # build, start, configure
make stack-seed STACK=demo                    # optional development accounts and entries
make stack-check STACK=demo                   # email + storage round trip
make stack-down STACK=demo                    # stop; volumes are kept
```

Defaults: `STACK=pocketbase-notes`, `STACK_PORT=8100`, `STACK_MAILPIT_PORT=8125`,
`STACK_RUSTFS_CONSOLE_PORT=9101`. Give concurrent stacks distinct ports. Rebuild
with `make stack-up` to pick up code changes. Secrets still come from `.env` at
start time. `docker compose -p <name> down -v` deletes that stack's data.

### RustFS storage

RustFS and its `rc` CLI use pinned, publicly pullable arm64/amd64 images. The
`storage-init` setup service creates the configured bucket idempotently. Files
live in the named `rustfs` volume and are accessed through PocketBase's protected
file API; browser code receives no S3 credentials.

`RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` configure the local API and console login;
`RUSTFS_BUCKET` selects the bucket. Defaults are documented in `.env.example`.
Production storage is configured separately in PocketBase. Changing an endpoint
or bucket does not copy files: back up, transfer and verify existing objects first.
The setup script refuses to overwrite a different active provider or bucket.

References: [RustFS Docker setup](https://docs.rustfs.com/en/installation/container/docker)
and [RustFS source](https://github.com/rustfs/rustfs).

## Shared image

```sh
docker build -f deploy/docker/Dockerfile -t pocketbase-notes-app .
```

The build copies only frontend inputs, uses the frozen Bun lockfile, and excludes
local environment files and certificates. The runtime includes the frontend,
PocketBase hooks and migrations, with `/pb` as its working directory. It serves
on `0.0.0.0:8080`; its Docker healthcheck requests `/api/health`.

The production frontend uses same-origin API requests. Runtime `VITE_*` variables
do not change the already-built frontend; the development auth bypass is disabled
in production. Runtime state must be persisted at `/pb/pb_data`. Migrations run on
startup; take a backup before upgrades and retain the prior image for rollback.
Restoring an older image alone does not undo database migrations.

## Railway

Keep the service root directory at the repository root and set the custom
config-as-code path to `deploy/railway/railway.json`. The existing JSON selects the
shared Dockerfile and `/api/health`; no start-command override is needed.

Configure the service separately:

- Set `PB_ENCRYPTION_KEY` to a securely generated value and retain it across deploys.
- Mount a persistent volume at `/pb/pb_data`; this holds the database and, by default,
  attachment files. S3 storage does not eliminate the database volume requirement.
- Set `PORT=8080` and the public domain's target port to `8080`, matching the image's
  fixed listener and Railway's healthcheck port.
- Run a single instance with its volume. This SQLite-backed app is not configured
  for horizontal replicas or multiple writers sharing a database.
- Create the first superuser in the running container using PocketBase's
  `superuser create` command with `--encryptionEnv=PB_ENCRYPTION_KEY`. Do not run the
  local seed script or install the development accounts.
- In PocketBase settings, set the public application URL and a real SMTP provider
  for registration verification and password resets. Configure S3 there only if
  external file storage is needed; local volume storage also supports attachments.

Mailpit and RustFS Compose services are local development tools, not provisioned by
`railway.json`. Local `.env` credentials are not production service variables.
Configure backups for the database and files, and retain the encryption key
separately. Confirm restoration before relying on backups.

After deployment, check `/api/health`, refresh a frontend route such as `/entries`,
and verify account email delivery plus attachment save/download after a restart.
A healthcheck alone does not test SMTP, S3 or file access rules. Railway deployment
has not been exercised by this local review.

References: [Railway config as code](https://docs.railway.com/config-as-code),
[Railway healthchecks](https://docs.railway.com/deployments/healthchecks),
[PocketBase deployment](https://pocketbase.io/docs/going-to-production/).

## Updates and verification

PocketBase's server version and per-architecture checksums are pinned in the
Dockerfile; keep the JS SDK compatible and regenerate record types with
`make codegen` when updating the server. Image digests require deliberate updates.

```sh
docker compose --project-directory . -f deploy/local/docker-compose.yml config --quiet
docker compose --project-directory . -f deploy/local/docker-compose-full.yml config --quiet
docker compose --project-directory . -p check -f deploy/local/docker-compose-stack.yml config --quiet
make check-services
```

The service check needs the running full stack and exercises real email tokens,
file storage and download bytes. See [application verification](../docs/VERIFICATION.md)
for editor and private-attachment tests.

## Railway rollout plan (2026-10-19)

Railway is the selected host. The first test deployment is live; see the verified
deployment record and runbook below. Remaining production-only checks are not
implied by this test release.
Use the existing shared Docker image and config path above; no separate frontend
service or replacement database is needed.

### Decisions before provisioning

- Select workspace/project, region and budget. Use separate staging and production
  environments with separate volumes, keys and credentials.
- Email decision confirmed: the workspace has Pro; use existing PocketBase SMTP
  support with Resend and the verified `send.functionform.ai` domain. Keep provider
  secrets out of build arguments and frontend variables. No HTTPS email adapter
  is planned. Railway permits SMTP only on Pro and higher.
  Selected provider: Resend over SMTP (`smtp.resend.com`, port 465 with TLS,
  username `resend`, API key stored as the SMTP password). A Google Workspace
  mailbox is not required for these automatic outbound messages.
  The owner has `functionform.ai` on Cloudflare and supplied a sending-only
  Resend key scoped to `send.functionform.ai`. Use sender `PocketBase Notes
  <noreply@send.functionform.ai>`. Retrieve the key at configuration time with
  `secret get PBNOTES_RESEND_API_KEY`; never commit its value or put it in frontend
  variables. Reuse this configured sending domain; do not create another domain
  or change DNS as part of deployment unless verification shows a need.
  Verified on 2026-10-19 with the management key retrieved via
  `secret get RESEND_API_KEY`: Resend reports `send.functionform.ai` verified,
  with DKIM and SPF records verified, sending enabled, receiving disabled, and
  open/click tracking disabled. Region: `us-east-1`; domain ID:
  `4eb73989-0994-4762-b49d-330da83a0cde`. No DNS changes are needed based on this check.
  The restricted app key also passed live SMTP TLS/authentication on port 465.
  Keep the broad key for management; deploy only the restricted app key as the
  SMTP password. No message has been sent; actual delivery and verification/reset
  token use still require staging round-trip checks. The app hostname remains to
  be chosen and does not need to match the sending subdomain.
  See [Resend SMTP](https://resend.com/docs/send-with-smtp) and
  [domain verification](https://resend.com/docs/dashboard/domains/introduction).
- Storage: proposed initial setup is attachment files alongside the database on
  the persistent volume, with PocketBase backups copied to a separate private
  S3-compatible backup bucket. This minimizes recovery components. If existing
  local RustFS content must migrate, explicitly transfer and verify its objects;
  changing PocketBase settings alone does not migrate data. If production uses
  S3 attachments instead, back up those objects separately.
- Confirm whether launch starts empty or imports existing notes/files; do not
  copy local development users or SMTP/S3 settings into production blindly.
- Agree on recovery targets. Proposed starting targets: at most 24 hours of lost
  data and restoration within one hour; these are unapproved until confirmed and
  unproven until the recovery drill. Choose the final application domain and OAuth
  providers before the final auth checks.

### Staging build and checks

1. Create the service with repository root as build context and
   `deploy/railway/railway.json` as the config path. Attach `/pb/pb_data`, set
   `PORT=8080` and a stable random 32-character `PB_ENCRYPTION_KEY`. Retain the key
   separately in the owner's secret store. Run one instance; plan for restart
   downtime with this volume-backed SQLite service.
2. Deploy an identified commit with passing CI. Record its deployment ID and
   immutable image identity. Observe deployment success, then check health and
   frontend deep-link refresh over HTTPS. Do not run local seed scripts.
3. Create the production-style superuser via the existing CLI procedure above.
   Configure app URL, sender and SMTP (or the selected HTTPS integration), rate
   limits, private storage and intended OAuth callback URLs. Verify actual mail
   delivery and verification/reset token use with dedicated test accounts.
4. Save notes and files, restart/redeploy, and compare document contents and file
   hashes. Test anonymous/cross-account denials and OAuth success/cancel/logout.
   Existing local browser tests reject remote origins intentionally; use a
   separate bounded staging verification path with disposable identities.
5. Repeat editor performance measurements over the Railway HTTPS origin after
   establishing the local production baseline; do not equate localhost timings
   with deployed performance. Verify `Content-Encoding`, transferred asset bytes
   and cache headers for hashed `/assets/` files before changing the editor bundle.
   Any CDN configuration must keep authenticated API responses and protected
   attachment downloads out of shared caches.

### Backups and recovery gate

- Enable Railway daily and weekly volume backups. Also schedule portable
  PocketBase backups to the separate backup bucket, with retention and failure
  notification verified. Back up before every migration-bearing deployment.
- PocketBase backups include locally stored files but exclude S3 attachment
  objects. Preserve those separately if that storage option is selected.
- Railway native backups can restore only within their original project and
  environment. Test native rollback in staging; use a portable PocketBase backup
  for an independent restore into a disposable isolated environment.
- Restore with the matching application image and encryption key. Disable real
  outbound mail during the drill. Verify database integrity, login, note contents,
  private attachment hashes and cross-account denial. Record backup age and actual
  recovery duration against the agreed targets.
- Retain the previous release and pre-migration backup. Rollback restores data
  when schema changes require it; redeploying an old image alone is insufficient.
- Before cutover, write and exercise exact upgrade/rollback and ground-zero rebuild
  steps using the selected service IDs, secret references and backup location.
  Unrun steps remain labelled unverified. Production rollout needs a reviewed
  evidence record; staging success alone is not production verification.

The test deployment uses the resources recorded below. The former local storage
container, volume and backup stay preserved independently of Railway rollout.

Sources checked for this plan:
[Railway outbound email](https://docs.railway.com/networking/outbound-networking),
[Railway volume backups](https://docs.railway.com/volumes/backups), and
[PocketBase backup contents](https://pocketbase.io/docs/going-to-production/).

## Live test deployment and operations (2026-10-19)

- App: https://notes-staging.up.railway.app
- Dashboard: https://railway.com/project/e768e428-d9a4-424c-9bd3-445945507c01
- Project `pocketbase-notes-test`, environment `staging`, service `notes`.
- Region Virginia (`us-east4-eqdc4a`), one instance capped at 1 vCPU / 1 GB RAM.
- A 1 GB volume is mounted at `/pb/pb_data`; database and attachments live there.
- Private `notes-backups` bucket in `iad` stores PocketBase backups, daily at
  07:00 UTC with seven retained. Railway volume backups are daily and weekly;
  the schedules were read back and a manual volume backup was created.
- No RustFS or Mailpit services are deployed. Resend delivers real mail; no local
  seed script was run. `admin@example.com` and `user@example.com` were absent.
- The app and superuser accounts use `henry.burden@gmail.com` with distinct random
  passwords. Credentials and the encryption key are in the ignored mode-0600
  `deploy/railway/.env`: use `PB_USER_PASSWORD` for the app, `PB_ADMIN_PASSWORD`
  for the PocketBase dashboard at `/_/`. Open it using the account menu →
  **PocketBase admin**; the link opens a new tab and does not pass credentials.
  API keys never enter the frontend.
- The owner subsequently created `hsburden3@outlook.com` and test content; those
  were preserved. Only the deployment verification fixture was removed.
- `VITE_SIGNUP_ENABLED=false` is explicit in Railway and defaults to false in
  both Docker stages. It hides the registration UI and the PocketBase hooks reject
  public user creation and new OAuth accounts. Existing logins and superuser
  creation remain available. To deliberately reopen signup, set it to `true` and
  redeploy so the frontend build and backend runtime agree. OAuth itself is not
  configured or end-to-end verified.

The first upload failed because Railway disallowed the generic BuildKit cache ID.
The Dockerfile now uses ordinary layer caching. Railway also rejected the legacy
`railwayConfigFile` setting as deprecated; this service instead has the Dockerfile
path, health check, region and limits configured directly. The older JSON remains
reference material, not the effective configuration for this deployment.

### Evidence

Live checks proved owner login, note save/reload, private attachment bytes,
anonymous and cross-account denial, and persistence after a logged server restart.
Resend reported both verification and password-reset messages delivered; their
links pointed to the deployed app and both tokens were accepted. Those test links
have already been consumed. Actual inbox placement was not manually inspected.

A portable backup was created in the bucket, downloaded, extracted and booted in
a separate local PocketBase instance. Mail and scheduled remote backups were
disabled in that copy before exposing its loopback test port. Login, note contents,
file bytes and anonymous denials passed against the restored data. The disposable
restore container/network were removed. The small-fixture drill proves restoration;
it is not a timed large-data RTO guarantee or a native Railway snapshot restore.

Evidence is preserved locally in
`~/.local/share/agent-artifacts/pocketbase-notes-app/2026-10-19-railway-test/`.
`restore-proof.zip` is the tested checkpoint; JSON files record mail delivery,
access checks and restoration. Keep backups and `PB_ENCRYPTION_KEY` separately.
The deployed main JS response was observed using gzip, unlike the local baseline;
a full deployed performance benchmark is still outstanding.

### Update and rollback

1. Run lint/build, local API tests and relevant browser tests. Preserve user data;
   do not run `make seed` remotely. Take a PocketBase backup before schema changes.
2. From this linked checkout, upload with `railway up --service notes --environment
   staging --detach --json -m "<summary>"`. Record the returned deployment ID;
   confirm that exact deployment reaches SUCCESS before declaring it live.
3. Check health, deep-link refresh, existing login, the signup policy and file
   access. Read back the volume mount and backup settings if infrastructure changed.
4. For a code-only rollback with compatible schema, redeploy the known-good
   Railway deployment. For schema/data rollback, restore the pre-change portable
   backup in an isolated instance first, verify it, then schedule replacement of
   the live data. Live destructive rollback was not exercised in this session.
5. Changing an env password does not change an existing PocketBase account's
   password. Use the app reset flow or the PocketBase dashboard and update the
   local credential record afterward. Never rotate the encryption key casually.

### Rebuild from nothing

1. Recreate the private project/environment, one app service, volume mount and
   backup bucket using the resource choices above. Choose a fresh service domain.
2. Generate a new encryption key and account passwords for a new empty install,
   or recover the original encryption key for a backup restore. Save them in an
   ignored mode-0600 env file. Set PORT=8080 and VITE_SIGNUP_ENABLED=false.
3. Configure Dockerfile `deploy/docker/Dockerfile`, health `/api/health`, region
   and instance limits directly on the service; upload the source and verify SUCCESS.
4. For an empty install, create the owner superuser with PocketBase's CLI inside
   the service, passing `--encryptionEnv=PB_ENCRYPTION_KEY`. Do not seed default users.
5. Review the exact target guard in `deploy/railway/configure.ts` for the new URL;
   run it only for initial setup. It deliberately refuses unexpected existing
   users. It configures SMTP, templates, local files, backup storage and the owner.
6. Enable/read back volume backup schedules. Run the email and app checks only on
   the intended test environment; they send real emails/create temporary fixtures.
   Restore a downloaded backup into a separate instance with outgoing mail disabled.
7. Verify all results and remove only the fixtures created by the checks. Recreating
   a second new cloud project from this runbook has not itself been exercised.
