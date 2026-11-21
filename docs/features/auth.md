# Sign-in and two-step sign-in

How people sign in to the app, how two-step sign-in works, and what an operator
needs to run it. PocketBase 0.40.x; the behaviour below was checked against 0.40.1.

## Sign-in methods

| Method | Where | Notes |
| --- | --- | --- |
| Email + password | `/auth/login` | The default. Unverified accounts are sent a verification link instead of being signed in. |
| OAuth2 (Google, GitHub, ...) | `/auth/login`, one button per provider | Shown only for providers enabled in PocketBase. New accounts through OAuth are refused unless `VITE_SIGNUP_ENABLED=true` (`pb/hooks/signup.pb.js`). |
| Two-step sign-in (optional, per user) | After either method above | An emailed one-time code as a second step. Off by default. |

A one-time code is never a way to sign in on its own: a code email goes out only after the
password (or OAuth2) step of an account with two-step sign-in on.

## Configure an OAuth2 provider

1. Create an OAuth app at the provider. Set its redirect (callback) URL to
   `https://<your-app-domain>/api/oauth2-redirect` (locally `http://127.0.0.1:<PB_PORT>/api/oauth2-redirect`).
2. Open the PocketBase dashboard (`/_/`) → **Collections** → **users** → gear icon → **Options** →
   **OAuth2**, enable it, add the provider, paste its client ID and secret, and save.
3. The login page lists the provider on next load (it reads `listAuthMethods()`).

The sign-in opens the provider in a new window, so browsers must allow pop-ups for the app.

## How two-step sign-in works

Built on PocketBase's own MFA and OTP, configured on the `users` collection by
`pb/migrations/1794796102_updated_users.js`:

- A boolean field `mfaEnabled` (default `false`) on each user.
- MFA on, with the rule `mfaEnabled = true`: only users who opted in need a second step.
  The second step must be a different method from the first and finish within 10 minutes.
- OTP on: 8-digit codes, valid 5 minutes, sent with the "Your sign-in code" email template.

Sign-in with it on:

1. The user enters email and password. PocketBase answers `401` with an `mfaId` and **no token**:
   the half-finished sign-in opens nothing.
2. The app shows **Check your email** and calls `request-otp` with the email **and the `mfaId`**.
   The user types the code; the app calls `authWithOTP(otpId, code, { mfaId })` and gets a
   normal session.
3. The app then follows the same return-URL rules as a password sign-in (`?redirect=` is only
   followed for same-site paths).

`pb/hooks/mfa.pb.js` sends a code only when the request carries an unexpired `mfaId` from this
account's first step. Every other `request-otp` call (no or someone else's `mfaId`, an account
with it off, an unknown email) gets a random decoy `otpId` and no email. The responses look the
same and take about the same time (measured median 0.4-0.5 ms on the dev stack; a real send,
only possible after the password, ~14 ms). So nobody without the password can flood the inbox,
use up the account's code attempts (the lock-out below) or find out who has it on.

Turning it on or off (`/account`, user menu → **Account security**):

- Needs the current password, checked by `pb/hooks/mfa.pb.js` (`currentPassword` in the update
  body). Wrong or missing password: `400`, nothing changes.
- Turning it on needs a verified email; the page explains this and offers a verification email.
- Users can only change their own record (the users update rule is `id = @request.auth.id`;
  another user gets `404`). Superusers can change it without a password (recovery, below).
- **Turning it on signs out every session** of the account (PocketBase's `tokenKey` is rotated),
  including other devices that never passed a second step. The tab that turned it on asks for
  the code it has just emailed, which also proves the email arrives; **Back to login** there
  signs out.
- **Turning it off** (by the user or a superuser) deletes the account's outstanding codes and
  pending second steps, so a code emailed earlier cannot sign in alone afterwards.
- Sign-up (when `VITE_SIGNUP_ENABLED=true`) always creates accounts with it off, so the
  verified-email check cannot be skipped.
- Accounts created through OAuth have a random password; to use two-step sign-in they first set
  one with **Forgot password**.

### Limits and errors

| Situation | What happens |
| --- | --- |
| Wrong code | `400`; the page says the code is wrong or expired. |
| Expired code (after 5 min) | `400`, same message. **Send a new code** gets a fresh one. |
| Used code | Codes work once; reuse is `400`. |
| More than 5 code checks for one account within 3 minutes (successful sign-ins count too) | `429` from PocketBase (built in, independent of the rate-limit setting). The page says to wait and send a new code. |
| Resend | The button unlocks 30 seconds after each send. Outside `--dev` mode PocketBase keeps at most 10 live codes per account and reuses the newest after that. |
| Second step not finished within 10 minutes | `400` "Invalid or expired MFA session"; the page says to sign in again. |

### OAuth2 with two-step sign-in

The MFA rule applies to OAuth2 too. After the provider window, a user with two-step sign-in on
sees **Check your email**, enters their account email, and finishes with a code. The OAuth step
does not tell the app the email address, which is why the page asks for it. (This path is
implemented but not covered by automated tests: no provider is configured in the test stacks.)

## What production needs

- **Working SMTP** (dashboard → **Settings** → **Mail settings**), with a real sender address.
  Codes are sent in the background: if sending fails, PocketBase logs
  "Failed to send OTP email" (dashboard → **Logs**) and the user waits for a code that never
  comes. Without working email, users with two-step sign-in cannot sign in.
- **Rate limiting on** (dashboard → **Settings**, rate limits; `rateLimits.enabled` in the
  settings API). It is off by default. It is general hygiene, not what protects two-step
  sign-in: limits are per IP, so they slow but do not stop targeted abuse. The hook above is
  what stops code emails and attempt burning for anyone without the password.
- `APP_URL` (Application settings) pointing at the app, as for the other emails.

## Rolling back the migration

`migrate down` on `1794796102_updated_users.js` removes the `mfaEnabled` field and turns MFA and
OTP off. That silently switches two-step sign-in off for **every** user, and their choice is lost:
they would have to turn it on again. Restore from a backup instead if you need the old state.

## Recovery: a user lost access to their email

Only a superuser can do this. Confirm the person's identity out of band first: turning the
second step off on a stranger's word defeats its purpose.

1. Open the dashboard (`/_/`) → **Collections** → **users** and find the account.
2. Either untick **mfaEnabled** (they sign in with their password again), or set **email** to a
   new address they control and tick **verified**.
3. Save. Any codes still in their old inbox stop working. If the password may also be
   compromised, have them use **Forgot password** after.

Over the API this is a superuser-authenticated `PATCH /api/collections/users/records/<id>` with
`{"mfaEnabled": false}`.

## Tests

- `scripts/test-mfa.ts` (part of `bun run test:api`): off by default, password and verified
  checks, owner-only flag, a pending `mfaId` reads nothing, wrong and reused codes, a code alone
  does not sign in, superuser recovery, decoy `request-otp` responses without a valid `mfaId`,
  codes voided when turned off, and sessions ended when turned on.
- The same script submits a public registration request with `mfaEnabled: true`. With
  `VITE_SIGNUP_ENABLED=true`, it reads back the new account and checks that two-step sign-in
  is off. With signup disabled, it expects HTTP 403.
- The `signup` browser profile checks that **Register** is disabled while the request is
  pending and that retrying a failed verification email request reaches the email verification
  page with only one account creation request. The `signup-disabled` profile checks that
  public registration returns 403, the login page has no **Register** link, the registration
  page explains that account creation is disabled and has no **Register** button, and an
  existing account can sign in.
- `tests/e2e/two-step.spec.cjs`: the whole flow through the UI in Chromium and WebKit at desktop
  and mobile sizes, reading codes from Mailpit.
