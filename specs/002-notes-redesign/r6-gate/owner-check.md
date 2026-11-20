# Owner check · physical Safari and timed cross-device capture

## SC-006 goal card · show this first

**On the phone, create Garden and capture a note titled “Seed order” with the body “Buy calendula for the south wall”. On the desktop, find it by its body word and open it.**

Show only this card once both devices are signed in at All Notes. The observer handles setup, starts the stopwatch at the first action, stops it when the opened desktop note shows the body, and gives no hints. Save the first attempt immediately in the result table, even if it fails or a later guided check fails. Pass requires exactly one match, the correct title, folder and full body, no assistance and ≤120 seconds. Any repeat uses a fresh account and a separate row.

## Choose the transport before setup

1. Record the owner's explicit transport approval in `$R6_OUT/phone/results.tsv`. The recommended option exposes the disposable candidate to trusted private Wi-Fi. The coordinator can run the start and stop blocks for the owner. The owner performs the phone checks.
2. Check the network. HTTP sends the disposable password and synthetic writing in clear. Use private authenticated HTTPS to the same candidate if the network is untrusted or isolates devices. An existing Railway build requires verified identity and authorization for invalidation. Leave the phone result pending if that proof is unavailable.
3. Use the disposable account below. The Mac's ordinary `notes-play` at `http://127.0.0.1:8100` is loopback-only. The password flow uses same-origin PocketBase and local browser storage. Draft IDs use getRandomValues. Clipboard, OAuth and email links have separate requirements. [Web Crypto](https://www.w3.org/TR/webcrypto/#crypto-interface) · [Clipboard](https://www.w3.org/TR/clipboard-apis/#navigator-interface) · [Secure contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy)

## Start the candidate · operator instructions

1. Get the absolute evidence folder path from the coordinator. It contains `w6.sha` from the completed machine proof.
2. Open Bash on the Mac with Docker running.
3. Paste the preparation block. Enter the evidence path at the prompt. It exports the exact recorded Git commit to a new directory and prints each published port. A mismatched map aborts before startup.

```bash
set -euo pipefail
umask 077
read -r -p 'R6 evidence folder: ' R6_OUT
test -d "$R6_OUT" && test -s "$R6_OUT/w6.sha" || exit 1
R6_SHA=$(cat "$R6_OUT/w6.sha")
R6_ROOT=/Users/henry/Developer/pocketbase-notes-app/.worktrees/r6-gate
[[ $R6_SHA =~ ^[0-9a-f]{40}$ ]]
test "$(git -C "$R6_ROOT" rev-parse --verify "$R6_SHA^{commit}")" = "$R6_SHA"
R6_WIFI=$(networksetup -listallhardwareports | awk '/Hardware Port: (Wi-Fi|AirPort)/ {getline; print $2; exit}')
R6_LAN=$(ipconfig getifaddr "${R6_WIFI:?Wi-Fi interface required}")
python3 - "$R6_LAN" <<'PY'
import ipaddress, sys
ip = ipaddress.IPv4Address(sys.argv[1])
assert any(ip in ipaddress.ip_network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')), 'Use trusted private Wi-Fi'
PY
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
cat > phone.yml <<YAML
services:
  pocketbase:
    ports: !override
      - "127.0.0.1:8216:8080"
      - "$R6_LAN:8216:8080"
YAML
make env
export STACK_PORT=8216 STACK_MAILPIT_PORT=8217 STACK_RUSTFS_CONSOLE_PORT=8218
export SEED_USER_EMAIL="$R6_LOGIN" SEED_USER_PASSWORD="$R6_PASS"
phone_compose() {
  docker compose --project-directory "$R6_DIR" -p "$R6_PROJECT" -f "$R6_DIR/deploy/local/docker-compose-stack.yml" -f "$R6_DIR/phone.yml" "$@"
}
phone_compose --profile setup config --format json | python3 -c '
import json,sys
actual=sorted((s,p.get("host_ip",""),str(p["published"]),p["target"]) for s,v in json.load(sys.stdin)["services"].items() for p in v.get("ports",[]))
for row in actual: print(*row)
assert actual==sorted([("pocketbase","127.0.0.1","8216",8080),("pocketbase",sys.argv[1],"8216",8080),("mailpit","127.0.0.1","8217",8025),("rustfs","127.0.0.1","8218",9001)])' "$R6_LAN" | tee "$R6_OUT/phone/$R6_PROJECT.ports"
```

4. Check the displayed map. Only PocketBase should appear on Wi-Fi port 8216. Mac loopback should list ports 8216, 8217 and 8218.
5. Paste the start block in the same Bash session after approval. It installs project-scoped cleanup before building. Success prints two login URLs and a disposable password. Keep this shell open for the password change.

```bash
trap 'phone_compose --profile setup down' EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
phone_compose --profile setup build
phone_compose up -d --wait --wait-timeout 90
phone_compose run --rm storage-init
phone_compose run --rm setup bun scripts/configure-services.ts
phone_compose run --rm setup bun scripts/seed.ts
curl -fsS "http://$R6_LAN:8216/api/health"
printf '\nMac http://127.0.0.1:8216/auth/login\niPhone http://%s:8216/auth/login\nLogin %s / %s\n' "$R6_LAN" "$R6_LOGIN" "$R6_PASS"
```

## Begin the owner session

1. Join the approved Wi-Fi network on the iPhone.
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
3. Attempt a Safari reload. Record whether Safari offers a native prompt.
4. Choose to stay if prompted. Record what writing remains. A missing prompt or a navigation is an observation to retain.
5. Return to the list. If the app guards departure, choose the explicit discard option for this disposable edit. The saved desktop copy should still exist.

## Guided check · prepare a fresh expiry note

1. Tap Compose on the phone. A fresh editor should open.
2. Enter a two-line note. Use `Expiry check` followed by the printed project name as the title, and `Before expiry` as the body.
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

1. Sign back in on desktop using the replacement password. All Notes should open.
2. Search for the unique title. There should be exactly one match.
3. Open the match. The note ID should match the earlier URL and both body lines should be intact.

## Stop the stack · works from a new shell

1. Get the session directory from the printed setup receipt in `$R6_OUT/phone/r6-phone-*.txt` for this project.
2. Open a new Bash shell.
3. Paste the stop block. Enter that session directory at the prompt. Compose stops only the recorded project and retains its volumes. An empty container listing confirms the LAN listener has stopped.

```bash
set -euo pipefail
read -r -p 'Phone session directory: ' R6_DIR
cd "$R6_DIR"
R6_PROJECT=$(cat phone.project)
[[ $R6_PROJECT =~ ^r6-phone-[0-9a-f]{16}$ ]]
docker compose --project-directory . -p "$R6_PROJECT" -f deploy/local/docker-compose-stack.yml -f phone.yml --profile setup down
remaining=$(docker ps -q --filter "label=com.docker.compose.project=$R6_PROJECT")
test -z "$remaining"
printf 'Stopped %s. Volumes retained.\n' "$R6_PROJECT"
```

## Result table

Record rows in `$R6_OUT/phone/results.tsv`. Add date/time zone, W6 SHA, project, transport approval, device, OS, Safari version, paired desktop/browser and observer to each row. Omit passwords. Record actual outcomes, including failed or untested cells.

| Check | Observation / saved ID | Seconds | Assistance given (none or exact hint) | Match count | Pass / fail / not tested |
|---|---|---:|---|---:|---|
| SC-006 first attempt | Title, body and folder | | | | |
| Keyboard and caret before/after dismissal | | — | | — | |
| Autosave and desktop read | | — | | — | |
| In-app leave, Retry and desktop read | | — | | — | |
| Native reload observation | | — | | — | |
| Expiry, restored words and independent final read | | — | | | |

Copy the results into the PR. Missing physical evidence leaves the relevant gate open. A lost draft or inaccessible capture/find step returns to G1. [Manual release checks](../../../docs/testing/verification.md#remaining-manual-release-checks)
