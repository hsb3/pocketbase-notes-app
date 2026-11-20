# Owner check · physical Safari and timed cross-device capture

## SC-006 goal card · show this first

**On the phone, create Garden and capture a note titled “Seed order” with the body “Buy calendula for the south wall”. On the desktop, find it by its body word and open it.**

Show only this card once both devices are signed in at All Notes. The observer handles setup, starts the stopwatch at the first action, stops it when the opened desktop note shows the body, and gives no hints. Record the actual body-only search term without prompting. Save the first attempt immediately in the result table, even if it fails or a later guided check fails. Pass requires exactly one match, the correct title, folder and full body, no assistance and ≤120 seconds. Any repeat uses a fresh account and a separate row.

## Choose the transport before setup

1. Record the approved transport in `$R6_OUT/phone/results.tsv`. Tailscale Serve is recommended and requires confirmation. The coordinator can run the start and stop blocks.
2. Run `tailscale status` on the Mac. Confirm the Mac and iPhone belong to the same tailnet.
3. Run `tailscale serve status`. Preserve every existing mapping, including TCP 40114. R6 needs its own free HTTPS port 8216. If it is occupied, stop before setup.

Safari signs into the disposable candidate over HTTPS. Serve terminates TLS on the Mac and proxies to loopback HTTP. The password and editor checks use the app’s same-origin session. OAuth, email links and clipboard behavior are outside this drill. Use tailnet-only Serve for R6. Leave existing listeners and their settings alone. If certificates are unavailable, a tailnet administrator can open **DNS → HTTPS Certificates → Enable HTTPS** with MagicDNS enabled and acknowledge public certificate logging of machine names. Obtain approval for that change or use the authenticated fallback below. [Tailscale HTTPS settings](https://tailscale.com/docs/how-to/set-up-https-certificates) · [Serve and scoped removal](https://tailscale.com/docs/reference/tailscale-cli/serve)

## Start the candidate · operator instructions

1. Obtain the absolute evidence path. It should contain `w6.sha` from the accepted machine proof.
2. Open Bash at the candidate checkout on the Mac. Docker should be running.
3. Paste the preparation block. The evidence-folder prompt should appear.
4. Enter the evidence path. The block exports the exact commit and prints the resolved ports.

```bash
set -euo pipefail
umask 077
read -r -p 'R6 evidence folder: ' R6_OUT
test -d "$R6_OUT" && test -s "$R6_OUT/w6.sha" || exit 1
R6_SHA=$(cat "$R6_OUT/w6.sha")
R6_ROOT=$(git rev-parse --show-toplevel)
[[ $R6_SHA =~ ^[0-9a-f]{40}$ ]]
test "$(git -C "$R6_ROOT" rev-parse --verify "$R6_SHA^{commit}")" = "$R6_SHA"
mkdir -p /private/tmp/agents/pocketbase-notes-app/owner-r6-phone "$R6_OUT/phone"
R6_DIR=$(mktemp -d /private/tmp/agents/pocketbase-notes-app/owner-r6-phone/session.XXXXXXXX)
git -C "$R6_ROOT" archive "$R6_SHA" | tar -x -C "$R6_DIR"
cd "$R6_DIR"
R6_PROJECT=r6-phone-$(openssl rand -hex 8)
printf '%s\n' "$R6_PROJECT" > phone.project
printf 'Candidate %s\nSession directory %s\nProject %s\n' "$R6_SHA" "$R6_DIR" "$R6_PROJECT" | tee "$R6_OUT/phone/$R6_PROJECT.txt"
R6_LOGIN=r6-phone@example.test
R6_PASS=$(openssl rand -hex 12)
R6_NEXT=$(openssl rand -hex 12)
make env
export STACK_PORT=8216 STACK_MAILPIT_PORT=8217 STACK_RUSTFS_CONSOLE_PORT=8218
export SEED_USER_EMAIL="$R6_LOGIN" SEED_USER_PASSWORD="$R6_PASS"
phone_compose() {
  docker compose --project-directory "$R6_DIR" -p "$R6_PROJECT" -f "$R6_DIR/deploy/local/docker-compose-stack.yml" "$@"
}
phone_compose --profile setup config --format json | python3 -c '
import json,sys
actual=sorted((s,p.get("host_ip",""),str(p["published"]),p["target"]) for s,v in json.load(sys.stdin)["services"].items() for p in v.get("ports",[]))
for row in actual: print(*row)
assert actual==sorted([("pocketbase","127.0.0.1","8216",8080),("mailpit","127.0.0.1","8217",8025),("rustfs","127.0.0.1","8218",9001)])' | tee "$R6_OUT/phone/$R6_PROJECT.ports"
```

5. Check the map. PocketBase 8216, Mailpit 8217 and the storage console 8218 should each appear once on `127.0.0.1`.
6. Paste the start block in the same Bash session. It registers cleanup before building and prints the Mac login and disposable credentials. Keep this shell open for the expiry drill.

```bash
cat > phone-stop.sh <<'STOP'
set -eu
cd "$(dirname "$0")"
project=$(cat phone.project)
[[ $project =~ ^r6-phone-[0-9a-f]{16}$ ]]
release_mapping() {
  [[ -f serve-8216 ]] || return 0
  local cfg
  cfg=$(tailscale serve status --json) || return 1
  if jq -e '.TCP["8216"] == null' <<<"$cfg" >/dev/null; then
    : # Setup stopped before the listener existed.
  elif jq -e --arg hp "$(cat serve-8216)" '
    .TCP["8216"].HTTPS == true and
    .Web[$hp].Handlers == {"/":{"Proxy":"http://127.0.0.1:8216"}}' <<<"$cfg" >/dev/null; then
    tailscale serve --bg --https=8216 off || return 1
  else
    echo 'Port 8216 changed. Inspect Serve status before removing anything.' >&2
    return 1
  fi
  rm serve-8216
}
rc=0
release_mapping || rc=$?
docker compose --project-directory . -p "$project" -f deploy/local/docker-compose-stack.yml --profile setup down
exit "$rc"
STOP
trap 'bash "$R6_DIR/phone-stop.sh"' EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
phone_compose --profile setup build
phone_compose up -d --wait --wait-timeout 90
phone_compose run --rm storage-init
phone_compose run --rm setup bun scripts/configure-services.ts
phone_compose run --rm setup bun scripts/seed.ts
curl -fsS http://127.0.0.1:8216/api/health
printf '\nMac http://127.0.0.1:8216/auth/login\nLogin %s / %s\n' "$R6_LOGIN" "$R6_PASS"
```

7. For the approved Tailscale transport, paste this block. It checks for a port collision immediately before registration, arms failure cleanup and prints the phone login only after the HTTPS health check succeeds.

```bash
dns=$(tailscale status --json | jq -er '.Self.DNSName | rtrimstr(".") | select(length > 0)')
tailscale serve status --json | jq -e --arg hp "$dns:8216" '
  (.TCP["8216"] == null) and (.Web[$hp] == null) and (.AllowFunnel[$hp] != true)' >/dev/null
printf '%s\n' "$dns:8216" > serve-8216
tailscale serve --bg --https=8216 http://127.0.0.1:8216
tailscale serve status
curl -fsS "https://$dns:8216/api/health"
printf '\niPhone https://%s:8216/auth/login\n' "$dns"
```

### Authenticated ngrok fallback

If approved instead of Tailscale, skip step 7. Use a signed-in ngrok agent in a separate terminal. In a private `phone-policy.yml` use the policy below, replacing the example address with the single authorized Google account. Start `ngrok http http://127.0.0.1:8216 --traffic-policy-file phone-policy.yml`. This creates a public HTTPS endpoint with an identity check. Verify a fresh Safari session requires that identity before the app login, then use the printed HTTPS address plus `/auth/login`. Stop that foreground tunnel with Ctrl-C before stopping Compose. [ngrok OAuth and email restrictions](https://ngrok.com/docs/gateway/traffic-policy/actions/oauth)

```yaml
on_http_request:
  - actions:
      - type: oauth
        config: {provider: google}
  - expressions: ["actions.ngrok.oauth.identity.email != 'approved@example.invalid'"]
    actions:
      - type: deny
        config: {status_code: 403}
```

## Begin the owner session

1. For Tailscale, open the Tailscale app on the iPhone. Its status should show **Connected** before Safari opens.
2. Sign in at the printed iPhone URL in Safari. All Notes should open.
3. Sign in at the printed Mac URL in a desktop browser. The same account should open with no Garden folder.
4. Complete the goal card at the top of this page without viewing the guided checks.
5. Have the observer save the first result before continuing.

## Guided check · keyboard and autosave

1. Open Garden on the iPhone. Its note list should appear.
2. Tap Compose once. The software keyboard should open with the caret in the editor.
3. Type `Keyboard check` followed by several lines. The latest line should remain visible above the keyboard.
4. Dismiss the keyboard. The last line should remain readable and **Saved** should appear.
5. Open the note on desktop. The words should match the phone.

## Guided check · leave and repair

1. Clear the writing in the saved phone note. An error should say the note needs writing or an attachment.
2. Tap the app's Back control. A leave prompt should appear.
3. Tap **Keep editing**. The empty draft should still be open.
4. Type `Recovered after leave`. The local text should reappear.
5. Tap **Retry**. The repaired draft should start saving.
6. Wait for **Saved**. The repaired note is ready for the desktop check.

## Guided check · desktop read and native reload

1. Reload the note on desktop. It should show `Recovered after leave`.
2. Clear the phone note again. The validation error should appear.
3. Attempt a Safari reload. A native confirmation may appear or the page may reload immediately.
4. If prompted, choose to stay. The editor should remain visible.
5. Record the prompt outcome and the writing visible after the attempt.
6. Return to the list if still in the editor. The list or the app’s leave prompt should appear.
7. If the leave prompt appears, tap **Discard**. The list should open with the saved note present.

## Guided check · prepare a fresh expiry note

1. Tap Compose on the phone. A fresh editor should open.
2. Enter a two-line note. The first line should read `Expiry check` followed by the printed project name. The second should read `Before expiry`.
3. Wait for **Saved**. Leave the phone on that note.
4. Open that uniquely titled note on desktop. Its body should say `Before expiry`.
5. Record the desktop note URL/ID. This identifies the saved, valid note for the expiry check.
6. Have the operator paste this block in the original Mac shell. It changes the disposable account's password and prints its replacement.

```bash
phone_compose run --rm -e R6_NEXT="$R6_NEXT" setup bun -e '
import PocketBase from "pocketbase";
const pb = new PocketBase("http://127.0.0.1:8080");
await pb.collection("_superusers").authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
const u = await pb.collection("users").getFirstListItem(pb.filter("email = {:email}", {email: "r6-phone@example.test"}));
await pb.collection("users").update(u.id, {password: process.env.R6_NEXT, passwordConfirm: process.env.R6_NEXT});'
printf 'Temporary replacement password: %s\n' "$R6_NEXT"
```

## Guided check · recover the same writing

1. Append a line `Held for this account` on the phone. When the save reaches the server, the private draft should disappear behind sign-in.
2. Tap **Sign in** if offered. The sign-in form should appear.
3. Sign in as `r6-phone@example.test` with the replacement password. The same note and latest words should return.
4. Tap **Retry**. The held edit should start saving.
5. Wait for **Saved**. The edit should now be available on both devices.

## Guided check · confirm the recovered note on desktop

1. Open a fresh private desktop browser session at the printed Mac login URL. The sign-in screen should appear with no active account.
2. Sign in as `r6-phone@example.test` with the replacement password. All Notes should open.
3. Search for the unique expiry title. Exactly one match should appear.
4. Open that match. The note should be visible.
5. Compare its URL/ID with the recorded ID. They should match.
6. Read the two body lines beneath the title. They should be `Before expiry` and `Held for this account`, in order.

## Stop the stack · works from a new shell

1. Read the session directory from the matching project receipt under `$R6_OUT/phone/`.
2. Open a new Bash shell. A prompt should appear.
3. Paste the stop block. It should ask for the session directory.
4. Enter the recorded directory. Cleanup removes this session’s Serve mapping and stops only the recorded Compose project, retaining its volumes.
5. Check the final Serve status. The R6 listener should be absent and the preflight mappings, including TCP 40114, should still be present.

```bash
set -euo pipefail
read -r -p 'Phone session directory: ' R6_DIR
cd "$R6_DIR"
bash phone-stop.sh
remaining=$(docker ps -q --filter "label=com.docker.compose.project=$(cat phone.project)")
test -z "$remaining"
tailscale serve status
```

## Result table

Record rows in `$R6_OUT/phone/results.tsv`. Add date/time zone, W6 SHA, project, transport approval, device, OS, Safari version, paired desktop/browser and observer to each row. Omit passwords. Record actual outcomes, including failed or untested cells.

| Check | Observation / saved ID | Seconds | Assistance given (none or exact hint) | Match count | Pass / fail / not tested |
|---|---|---:|---|---:|---|
| SC-006 first attempt | Body-only search term, title, body and folder | | | | |
| Keyboard and caret before/after dismissal | | — | | — | |
| Autosave and desktop read | | — | | — | |
| In-app leave, Retry and desktop read | | — | | — | |
| Native reload observation | | — | | — | |
| Expiry, restored words and independent final read | | — | | | |

Copy the results into the PR. Missing physical evidence leaves the relevant gate open. A lost draft or inaccessible capture/find step returns to G1. [Manual release checks](../../../docs/testing/verification.md#remaining-manual-release-checks)
