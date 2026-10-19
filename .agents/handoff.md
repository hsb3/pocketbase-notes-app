# PocketBase Notes handoff

Updated: 2026-10-19. Integration branch: `main`.

## Current state

Private notes/journaling app built with React, TanStack Router, shadcn,
ProseKit and PocketBase. The prebuilt UI is the sole active interface: collapsible
sidebar, full-width writing mode, compact header and bottom word-count rail.
The prior custom UI remains in Git history, not runtime routes.

The full ProseKit registry editor replaces the basic toolbar editor. Formatting,
slash commands, tables, code/math, resizable images and attachment upload/download
are connected to saved entries. Explicit Save and unsaved-navigation guards remain.
Sharing, collaboration, AI and offline sync are not implemented; no env flags enable
them. `.env.example` documents every app/service/test environment setting.

Local Mailpit and RustFS integration is implemented and verified. Use
`make start-full` (or `make up-full` plus `make dev`) for the configured local stack.
The running development session uses Vite on port 5173; backend host port comes
from the ignored `.env`. No production deployment was performed.

## Decisions and safety contracts

- Prefer upstream prebuilt blocks; the full editor comes from
  `@prosekit/react-example-full`. Demo documents and fake people/tag suggestions
  are not loaded. Source notices are in `docs/design/prebuilt-ui.md`.
- Attachments upload through PocketBase into protected records; RustFS credentials
  never reach the browser. Persist stable `attachment:<id>` image references,
  never signed URLs or blob URLs. See `docs/ATTACHMENTS.md` for the contract.
- Entry create/update transactions validate attachment ownership and references.
  Existing revision checks reject stale saves. Referenced files cannot be deleted.
- Abandoned uploads are collected hourly after the documented grace period;
  unsaved drafts remain memory-only. Conflict copy-text recovery excludes files
  and formatting; download unsaved files before discarding a conflicting draft.
- SMTP/S3 are persisted PocketBase settings. Switching to `make up` does not
  disable them. Full-stack setup refuses existing local files or a changed active
  bucket; changing environment values is not a storage migration.
- Keep `PB_ENCRYPTION_KEY` stable. Secrets, backend data and dev TLS certificates
  remain ignored. Production SMTP/S3 providers need separate configuration.

## Verification completed

Passed against the local backend during this session:

- `bun run lint`, `bun run build`, `bunx tsc -p scripts/tsconfig.json`.
- `make check-services`: verification/reset email delivery and token use through
  Mailpit, plus real RustFS file storage and retrieval.
- `bun run scripts/test-entries.ts`: persistence, validation, account isolation,
  revision conflicts and concurrent updates.
- `bun run scripts/test-attachments.ts`: rich document round trip, protected
  downloads, cross-account denial, file/URL validation and reference-safe deletion.
  Cleanup selection uses fixture SQL; the live cleanup job retained a fresh upload.
- `bunx playwright test notebook`: saves, navigation, conflict and
  expired-session recovery, sidebar/calendar collapse, focus mode and mobile layout.
- `bunx playwright test attachments`: upload before first save,
  private images after reload, download bytes, tables, removal and rejected files.
  Install Chromium with `bun run test:install`. Browser runs manage their own Vite
  server and put artifacts in ignored `test-results/` and `playwright-report/`.

The smoke test was verified to fail against an isolated app copy that saved the
wrong title. Failure artifacts were produced and its test user was cleaned up.
The normal smoke and complete API/browser suites passed.

CI is defined in `.github/workflows/ci.yml`; `docs/CI.md` describes the required
quality and amd64/arm64 integration checks plus admin-enforced PR/force-push rules.
GitHub ruleset definitions are tracked in `.github/rulesets/`.

## Known caveats and next session

RustFS powers local object storage. `make smoke` and `make e2e` run live service
and browser checks; setup and coverage are in `docs/VERIFICATION.md`.
Repository: `https://github.com/hsb3/pocketbase-notes-app` (public source code).
Notes and files remain private through PocketBase access rules. The full editor adds a large lazy
bundle; Vite's chunk-size warning remains. Real-time collaboration and public
sharing would require new product/backend work, not a configuration change.

This project does not use Kata. Follow-up scope and verification live in this
handoff and the conversation.

PocketBase schema changes were made through the authenticated collection API with
explicit approval because no interactive browser was available; generated migrations
are retained. Record types were regenerated using `make codegen`. Do not hand-edit
`src/services/pocketbase-types.ts` or `src/route-tree.gen.ts`.

Internal multi-relation reference queries must use `attachments.id ?= {:id}`;
`attachments ?= {:id}` did not perform the intended membership check. The attachment
regression test covers deletion while referenced.

## Map

- `docs/DEVELOPMENT.md`: local stack and commands.
- `docs/ROOT-FILES.md` and `.env.example`: configuration and settings boundaries.
- `docs/ATTACHMENTS.md`: editor, uploads, privacy, cleanup and test contract.
- `docs/VERIFICATION.md`: application verification coverage.
- `pb/hooks/`: entry validation, revision checks and attachment cleanup.
- `pb/migrations/`: retained generated users/entries/attachments schema changes.

## Next-work plan

Planning only: the steps below are proposed work, not completed verification.
Goal: establish measured editor responsiveness, close the named coverage gaps,
and deploy with demonstrated email, persistence and recovery. Retire local rollback
assets only after their replacement is proven and their removal is approved.

### 1. Establish the editor performance baseline

- Use the production build served with the real local backend and auth enabled;
  the existing Playwright web server runs Vite development mode and is not the
  performance baseline. Use synthetic empty, representative and large entries,
  including attachment-heavy content; record fixture sizes.
- Measure cold navigation to the app and first editor open separately from warm
  reopening. Record navigation-to-editable, first successful input, transferred
  bytes, editor chunk load/parse time and long tasks. Record commit, browser,
  hardware, cache state and network/CPU profile so results can be reproduced.
- Repeat each scenario at least five times; report individual runs, median and
  range. Compare a normal desktop profile with a constrained mobile profile;
  identify simulated measurements explicitly.
- Propose a loading-time budget from the measured user experience for approval.
  Only then optimize a demonstrated bottleneck. Preserve editor capabilities;
  a chunk-size warning alone is not grounds to replace or trim the editor.
- Done when a reproducible baseline and bottleneck assessment exist. Any ensuing
  optimization must meet the agreed budget under the same conditions and pass
  save/reload, formatting and attachment regression checks.

### 2. Broaden verification

- Extend the existing browser scenarios to WebKit, retaining Chromium. Firefox
  is deferred by owner request and excluded from the active matrix.
  Record browser versions and failures; verify actual Safari separately because
  a Playwright WebKit pass does not certify Safari.
- Review keyboard-only navigation, focus visibility/order, dialogs, toolbar and
  slash-menu operation, accessible names, errors, contrast and zoom/reflow.
  Exercise login, editing, save feedback and recovery with VoiceOver in Safari.
  Automated accessibility findings supplement manual checks.
- On real iOS and Android devices, test on-screen keyboard opening/dismissal,
  caret visibility, scrolling, selection, composition/autocorrect, toolbar access,
  save and navigation guards. Also check external keyboard shortcuts where available.
  Device/OS/keyboard combinations must be recorded; viewport emulation is not proof.
- Confirm which OAuth providers are intended before configuration. With dedicated
  test identities, cover login, cancellation/denial, redirects, logout/relogin,
  existing-email/account-linking behavior and private-data isolation. Repeat the
  callback flow on the eventual deployed HTTPS origin.
- Done when the matrix records pass/fail/not-tested with evidence. Fix release
  blockers and rerun the affected flows; explicitly accept or defer other gaps.
  Physical-device checks require access to those devices or owner-run results.

### 3. Validate production deployment on Railway

- Railway is selected. Follow the rollout plan in `deploy/README.md`. Establish
  budget, region, domain, OAuth providers and recovery targets. Railway Pro and
  existing SMTP support are confirmed; choose the sender/provider and storage
  setup before provisioning.
- Choose SMTP and storage with the host: persistent local attachments versus a
  private S3-compatible bucket. Include database persistence, backup destination,
  retention, credentials and ongoing operational cost in the decision.
- Deploy the existing shared image to a staging environment with a persistent
  database volume and stable encryption key. Keep development users and seed
  scripts out of production. Configure HTTPS, application URL and provider secrets.
- Verify real verification/reset email delivery and token use, attachment bytes
  after restart/redeploy, deep-link refresh and anonymous/cross-account denial.
  Use dedicated staging checks: existing browser tests deliberately reject remote
  URLs and must not be pointed at production by removing their safety checks.
- Back up database/settings and attachment objects as a consistent recoverable set;
  retain the encryption key separately. Define scheduling, retention and failure
  reporting. Restore into an isolated environment and prove login, entry contents,
  private downloads and access controls; record measured recovery time and data age.
- Document and exercise deployment rollback. An older image alone does not reverse
  migrations. Produce upgrade/rollback and ground-zero rebuild runbooks; label any
  unexercised step. Recheck performance on the deployed origin.
- Done when the chosen setup passes these checks, the restore meets agreed RPO/RTO,
  and the release evidence supports an explicit production cutover decision.

### 4. Retire preserved local rollback assets

- User reports the former storage container, volume and backup are preserved;
  their exact identities and current state have not been rechecked for this plan.
- Inventory exact container/volume names, mounts, backup paths and ownership.
  Prove the active stack has no dependency on them and compare migrated data.
- Gate removal on verified replacement storage, a successful independent restore,
  completion of the agreed rollback window and explicit approval of the exact
  removal list. A production deployment alone does not retire local rollback needs.
- Remove only approved assets; never use broad Docker prune or volume deletion.
  Recheck the active stack and attachment retrieval afterward.
- Done when the approved assets are gone, retained recovery material is documented,
  and the live local stack still passes its service checks.

### Sequence and next decision

Start with the performance baseline. Browser/accessibility coverage can follow
while Railway configuration decisions are pending. Provider selection precedes provisioning; deployed
OAuth and delivery checks follow staging. Cleanup stays last and blocked on its
own rollback-retirement decision. No dates are assigned until device access and
hosting requirements are known.

## Build-out verification (2026-10-19)

- Added `bun run test:performance` for the locally served Docker production build:
  five cold/warm repetitions on desktop and simulated mobile for empty, typical,
  large and ten-image notes, plus app-shell loading. All 100 samples passed. Typical
  note median: desktop cold 0.46s; simulated mobile cold 17.50s / warm 1.42s.
  The local server sends the 2.31 MB editor asset uncompressed. Check compression
  before changing the editor bundle; results and proposed budgets are recorded in
  `docs/VERIFICATION.md`. No bundle optimization was applied.
- Added Chromium/Firefox/WebKit Playwright projects and browser installation in CI.
  The final local Chromium/WebKit run passed all six scenarios (53.3 seconds).
  Linux CI has not been run with this change.
- The broader run exposed a save-completion race. The editor now awaits synchronous
  route invalidation before reporting Saved; the existing session-expiry recovery
  scenario failed before the fix and passed in both working browser engines after it.
- The attachment scenario now waits for the saved image after editor remount before
  reloading. This preserves its error assertion and verifies an additional real
  state; WebKit previously reported a pending token request during immediate reload.
- Firefox 157 (Playwright build 1555) could not launch on this Mac: "Could not find
  profile folder." Retrying with a dedicated temporary profile directory failed
  the same way. No Firefox application scenario ran. Upstream issue for a matching
  macOS symptom: https://github.com/microsoft/playwright/issues/42768 (cause here
  not independently confirmed). The owner deferred Firefox; it is excluded from
  browser installation and the active local/CI matrix. No license failure was observed.
- Railway is selected and Pro plus existing SMTP support are confirmed. The scoped
  rollout plan is in `deploy/README.md`; no Railway resources were provisioned.
  Email: the owner supplied sending-only key `PBNOTES_RESEND_API_KEY`, scoped to
  `send.functionform.ai`, for sender `noreply@send.functionform.ai`. Retrieve through
  `secret get`; never store the value in this repo. Resend recognized the key but
  correctly denied domain listing. Live SMTP TLS/authentication on port 465
  succeeded without sending mail. A subsequent read with management key
  `RESEND_API_KEY` confirmed the domain, DKIM and SPF verified, sending enabled,
  receiving disabled and open/click tracking off. No DNS changes are needed based
  on that check. Use only the restricted key for application SMTP configuration.
  Actual delivery remains untested. App hostname, hosting region, storage and
  recovery targets remain decisions.
- Actual Safari, physical mobile keyboards, VoiceOver/accessibility and OAuth remain
  unverified. Manual checks are listed in `docs/VERIFICATION.md`.
- Preserved former storage assets were not removed. The current local full stack
  was started for verification and remains running.

## Railway test release and signup policy (2026-10-19)

Live app: https://notes-staging.up.railway.app. Project `pocketbase-notes-test`,
staging environment, Virginia, one instance, 1 GB persistent database/file volume.
Latest verified deployment: `4af233eb-763e-4538-ae12-ae653e78c5f9` (SUCCESS).
The Docker build uses ordinary layer caching because Railway rejected the previous
cache-mount ID. Service configuration is set directly; the legacy config-file
setting was rejected as deprecated. Exact operations are in `deploy/README.md`.

Fresh provisioning included only the requested email for an app account and a
separate superuser, with distinct generated passwords. Credentials are in ignored
`deploy/railway/.env` (0600); use `PB_USER_PASSWORD` for the app. No default seed
accounts were created. The owner then created `hsburden3@outlook.com` and a note
with an attachment; both accounts and that content were preserved. Test fixtures
were removed by their recorded IDs, not by blanket collection cleanup.

Resend delivery and verification/reset token consumption passed. Note/file data
survived a logged service restart. A real portable backup from the private backup
bucket was restored and verified in a separate local instance, with outbound mail
and scheduled remote backups disabled there; its temporary container was removed.
Daily PocketBase backups retain seven copies; Railway daily/weekly volume backup
schedules and a manual snapshot were verified. Failure alerts, large-data recovery
timing and native Railway snapshot restoration are not certified by this exercise.

`VITE_SIGNUP_ENABLED` defaults to false, controls both the UI build and backend
runtime, and is explicitly false on Railway. `pb/hooks/signup.pb.js` blocks public
user creation (including new OAuth accounts) while allowing superuser-created
accounts and existing logins. Live checks proved anonymous/non-admin creation 403,
admin creation/deletion success, hidden registration UI and working owner login.
No API-rule/schema migration was needed. OAuth providers themselves remain untested.
Local Chromium and WebKit registration regressions passed; the UI regression failed
before the change. Production bundle responses use gzip; the full constrained-network
benchmark has not yet been rerun against Railway.

Live evidence and the tested restore ZIP are preserved under
`~/.local/share/agent-artifacts/react-pocketbase/2026-10-19-railway-test/`.
The preserved former local storage rollback assets were not removed.

## Admin portal shortcut (2026-10-19)

The signed-in account menu now includes **PocketBase admin**, opening the configured
backend's `/_/` URL in a separate tab. It is a navigation link, not an authorization
check or automatic login; all signed-in users can see it, and the dashboard still
requires superuser credentials. The PocketBase client resolves the correct backend
origin for local development and same-origin deployment.

Local Chromium/WebKit checks passed, as did lint/build. Deployment
`4f8dd5de-22a3-4486-82a7-1c041d1b8f07` reached SUCCESS. Live browser verification
confirmed the link opens the admin password form and the original app remains
logged in after reload. No account or data changes were made for this feature.
