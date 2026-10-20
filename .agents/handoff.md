# PocketBase Notes handoff

Updated: 2026-10-19. Integration branch: `main`.

## Start here

- [PR #2 — Railway deployment, signup controls and admin access](https://github.com/hsb3/pocketbase-notes-app/pull/2)
  is merged as `7904e21bf0722b7e53a2d9b2326240585ff290b5`.
- Quality, E2E (amd64) and E2E (arm64) passed before merge. The
  [post-merge CI run](https://github.com/hsb3/pocketbase-notes-app/actions/runs/39325031252)
  also passed. The feature branch was removed; the checkout is on `main`.
- Next requested feature is [issue #3 — Add isAdmin() check for PocketBase admin shortcut](https://github.com/hsb3/pocketbase-notes-app/issues/3),
  currently OPEN. Only the issue was requested/created; its implementation has not started.
- The local checkout was renamed from `react-pocketbase` to `pocketbase-notes-app`
  (`/Users/henry/Developer/pocketbase-notes-app`). The Railway CLI link was re-keyed
  to the new path; the dev Compose project is now `pocketbase-notes-app` (old
  `react-pocketbase_*` volumes were copied, then deleted at the owner's request).
  Agent artifacts and `/private/tmp/agents/` scratch moved to `pocketbase-notes-app`.
- This project does not use Kata. Use the requested GitHub issues and this handoff.
- The app is a live **test/staging deployment**, not a certified production rollout.

## Current app and access behavior

Private notes/journaling app using React, TanStack Router, shadcn, ProseKit and
PocketBase. The prebuilt UI is the active interface: collapsible sidebar,
full-width writing mode, compact header and bottom information rail. The full
editor supports formatting, slash commands, tables, code/math, resizable images
and private attachments. Explicit Save, unsaved-navigation guards and revision
conflict protection remain. Sharing, collaboration, AI and offline sync are absent.

`VITE_SIGNUP_ENABLED` defaults to `false` and is explicitly false on Railway.
It controls both the frontend build and PocketBase runtime. The registration form
is unavailable, and `pb/hooks/signup.pb.js` rejects public/non-admin user creation
and creation of new OAuth accounts. Existing users can log in; superusers can
create accounts. To deliberately enable signup, set the flag to `true` and rebuild/
redeploy so the UI and backend agree. No schema migration was needed for this gate.

The account menu includes **PocketBase admin**, opening the configured backend's
`/_/` URL in another tab. It currently appears for **all signed-in app users**.
It does not grant admin privileges or pass credentials; the dashboard requires a
separate superuser login. This visibility limitation is what issue #3 addresses.

For that issue, determine `isAdmin()` through a server-verified association with
an administrator. Do not trust frontend email comparisons or client-supplied roles,
expose the superuser directory, or embed admin credentials. Hide the link for
ordinary users, pending/failed checks and after account changes. Test admin and
non-admin behavior against the real backend; keep dashboard authentication intact.

## Live Railway deployment

- App: https://notes-staging.up.railway.app
- Admin: https://notes-staging.up.railway.app/_/
- [Railway project](https://railway.com/project/e768e428-d9a4-424c-9bd3-445945507c01):
  `pocketbase-notes-test` (`e768e428-d9a4-424c-9bd3-445945507c01`).
- Environment: `staging` (`be738108-6311-4dcc-8495-58646039ee51`).
- Service: `notes` (`aa2bfcdd-def3-49f2-aefa-179d9d544999`).
- Latest deployment rechecked SUCCESS:
  `4f8dd5de-22a3-4486-82a7-1c041d1b8f07` (admin shortcut).
  This was a CLI source upload before the Git squash merge, not a deployment
  identified by merge commit `7904e21`.
- Virginia (`us-east4-eqdc4a`), one instance, limits 1 vCPU / 1 GB RAM.
- A 1 GB volume at `/pb/pb_data` holds the database and attachment files.
- Private `notes-backups` bucket in `iad`: PocketBase backup daily at 07:00 UTC,
  seven copies retained. Railway daily/weekly volume schedules are also enabled.
- No RustFS or Mailpit runs on Railway. Resend handles real mail; the volume and
  backup bucket replace the local storage services for this deployment.

Service settings directly select `deploy/docker/Dockerfile`, `/api/health`, region
and limits. Railway rejected the legacy config-file-path setting as deprecated;
`deploy/railway/railway.json` is reference material, not the effective service
configuration. The Dockerfile uses ordinary layer caching because Railway rejected
its former generic BuildKit cache-mount ID. Update/rebuild/rollback instructions
are in `deploy/README.md`; do not rerun initial setup blindly on existing data.

## Credentials and user data

- `deploy/railway/.env` is ignored, mode 0600, and excluded from the Docker context.
  It contains deployment IDs, encryption key, app/admin passwords and service
  credentials. Never commit its values or copy them into frontend variables.
- The requested app and superuser accounts use `henry.burden@gmail.com` with
  distinct passwords: `PB_USER_PASSWORD` for the app, `PB_ADMIN_PASSWORD` for admin.
  Changing a Railway env password does not change an existing PocketBase account.
- The owner created `hsburden3@outlook.com` while testing signup and added a note
  with an attachment. Preserve that account and content; they are not fixtures.
- Fresh provisioning did not run seed scripts. `admin@example.com` and
  `user@example.com` were confirmed absent. Only recorded verification fixtures
  were deleted. The site is no longer empty because the owner has used it.
- Resend sends from `noreply@send.functionform.ai`; the domain/DKIM/SPF were verified.
  `functionform.ai` DNS is managed in Cloudflare. No DNS changes were made here.
- Retrieve restricted SMTP key with `secret get PBNOTES_RESEND_API_KEY`.
  Management key `secret get RESEND_API_KEY` was used only for verification.
  Deploy the restricted key, not the broad management key. SMTP: `smtp.resend.com`,
  port 465/TLS, username `resend`. Google Workspace is not required for this sending path.
- Keep `PB_ENCRYPTION_KEY` stable and retain it separately from backups.

## Verified results and evidence

Local lint/build and script type checks passed. The full local service/API suite
and all 10 Chromium/WebKit browser scenarios passed before PR creation. GitHub
then passed Quality and native amd64/arm64 integration checks on the PR and main.
The suite includes signup denial and admin-shortcut navigation. Firefox was
explicitly deferred by the owner and removed from installation and the matrix.

Live checks proved browser login, note save/reload, private attachment bytes,
anonymous/cross-account denials and persistence after a logged server restart.
Resend reported verification/reset emails delivered, and both tokens were accepted.
Those test links were consumed; actual inbox placement was not manually inspected.

A portable backup from the private bucket was downloaded and restored into a
separate local PocketBase instance. Mail and scheduled remote backups were disabled
in that copy. Login, note contents, attachment bytes and anonymous denials passed;
the temporary restore container/network were removed. Railway schedules were read
back and a manual volume snapshot was created. Native Railway snapshot restoration,
backup failure alerts and large-data recovery timing were not exercised.

Live signup checks returned 403 for anonymous and ordinary authenticated creation,
while superuser creation/deletion and existing login succeeded. The admin shortcut
opened the separate admin password form; the original app stayed logged in after
reload. OAuth providers are not configured/end-to-end verified.

The editor benchmark completed 100 samples against the local production image.
Typical-note medians: desktop cold 0.46 s; simulated mobile cold 17.50 s / warm
1.42 s. The local server sent the 2.31 MB editor asset uncompressed. Railway's main
JS response was observed using gzip, but the full deployed benchmark remains to
be run. Check actual transfer/compression before restructuring the editor bundle;
no bundle optimization or approved performance threshold has been applied.

Evidence outside disposable Playwright output:

- `~/.local/share/agent-artifacts/pocketbase-notes-app/2026-10-19-editor-baseline/`:
  raw measurements and local browser/performance reports.
- `~/.local/share/agent-artifacts/pocketbase-notes-app/2026-10-19-railway-test/`:
  delivery/access/signup/admin-link results, screenshots and the tested restore ZIP.

## Remaining work and constraints

1. Implement issue #3 when requested; do not mistake the visible shortcut for an
   already-implemented `isAdmin()` capability.
2. Measure Railway performance under the recorded constrained-network profile.
   Proposed budgets in `docs/VERIFICATION.md` are not yet approved or enforced.
3. Actual Safari, physical iOS/Android keyboards, VoiceOver/accessibility and OAuth
   remain unverified. WebKit and mobile viewport tests do not certify those.
4. Before wider production use, exercise backup failure reporting, native rollback
   and realistic recovery targets. The small portable-restore drill is narrower.
5. The legacy `react-pocketbase_minio` volume was deleted at the owner's request.
   The old `react-pocketbase-pocketbase` image remains; remove only with approval.
   No broad prune or volume deletion.

Attachments use stable `attachment:<id>` references, never persisted signed/blob
URLs. Backend validation enforces ownership and reference-safe deletion. Internal
relation filters must use `attachments.id ?= {:id}`, not `attachments ?= {:id}`.
Unsaved drafts are memory-only; conflict copy-text recovery excludes files/formatting.
SMTP/S3 are persisted settings: changing Compose targets or env values does not
migrate files or revert providers. Never hand-edit generated route/type files.

## Local operation and document map

Use `make start-full` for local PocketBase, Mailpit, RustFS and Vite. Backend port
comes from ignored `.env`; no development-server liveness is implied by this file.
Those dev stacks bind-mount the checkout. For a stack independent of the checkout
(baked image, per-stack volumes, no fixed container names), use
`make stack-up STACK=<name>` plus `stack-seed` / `stack-check` / `stack-down`;
see `deploy/README.md#self-contained-stacks`. Verified locally on a throwaway stack:
seed, service check and restart passed with only named-volume mounts.
`make smoke` / `make e2e` target the local stack; do not remove their loopback guards
to point them at Railway. The deployment helpers have explicit target/fresh-data
assumptions and some send real email; review them before rerunning on used data.

- `deploy/README.md`: live service choices, credentials references, update/rollback/rebuild.
- `docs/DEVELOPMENT.md`: local commands and services.
- `docs/ROOT-FILES.md`, `.env.example`: actual configuration documentation.
- `docs/ATTACHMENTS.md`: privacy, storage, cleanup and editor contracts.
- `docs/VERIFICATION.md`: coverage, baseline results and remaining manual checks.
- `docs/CI.md`: workflow and repository protections.
- `.agents/context/feature-workflow.md`: shared feature procedure.
