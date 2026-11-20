# Owner check · physical Safari and timed cross-device capture

**Decision before setup.** Recommend a fresh synthetic stack on the Mac, temporarily bound to its private Wi-Fi IPv4 address. This tests the exact R6 candidate, allows real session invalidation and keeps the existing `notes-play` database separate. Its usual Mac-only address is `http://127.0.0.1:8100` (demo login `user@example.com`, password `user-changeme-123`, two-step off). Loopback on an iPhone addresses the iPhone. Changing only STACK_PORT does not change the bind interface.

A private authenticated HTTPS tunnel to a disposable loopback stack would also support clipboard and encrypted transport, with a tunnel account/client, access controls and iPhone trust to establish first. The Railway URL offers HTTPS but requires a verified matching build and a disposable identity on a real service. Do not run deployment or account drills there. Record the owner's transport choice. Crews run all automated stacks through the contained runner. The owner alone runs the following hands-on session on trusted, non-public Wi-Fi after choosing LAN.

**HTTP scope.** The built client defaults to the same origin. Password auth uses the PocketBase browser auth store (local storage, bearer token), independent on each device. The sidebar preference cookie has no Secure requirement. Draft IDs use `crypto.getRandomValues`, available on HTTP. Async clipboard in the conflict dialog needs a secure context. Copy draft, OAuth and MFA email links are outside this phone exercise. HTTP carries the throwaway login and notes in clear on that network. Stop if the WLAN is untrusted or isolates peers. [Web Crypto interface](https://www.w3.org/TR/webcrypto/#crypto-interface) · [Async clipboard](https://www.w3.org/TR/clipboard-apis/#navigator-interface) · [Potentially trustworthy origins](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy)

## Start the candidate

Use a Mac terminal at the integrated R6 checkout. Use the commit selected for review; compare the printed SHA with the PR candidate. Start a Bash session with `bash`, then paste this block. Keep that shell for verification and shutdown. Docker Desktop must be running. Use the two URLs and random phone password printed at the end of this block.

```bash
set -euo pipefail
R6_SHA=$(git rev-parse HEAD)
R6_ROOT=$(git rev-parse --show-toplevel)
R6_WIFI=$(networksetup -listallhardwareports | awk '/Hardware Port: (Wi-Fi|AirPort)/ {getline; print $2; exit}')
R6_LAN=$(ipconfig getifaddr "${R6_WIFI:?Wi-Fi interface required}")
python3 - "$R6_LAN" <<'PY'
import ipaddress, sys
ip = ipaddress.IPv4Address(sys.argv[1])
assert any(ip in ipaddress.ip_network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')), 'Use trusted private Wi-Fi'
PY
umask 077
mkdir -p /private/tmp/agents/pocketbase-notes-app/owner-r6-phone
R6_DIR=$(mktemp -d /private/tmp/agents/pocketbase-notes-app/owner-r6-phone/session.XXXXXXXX)
git -C "$R6_ROOT" archive "$R6_SHA" | tar -x -C "$R6_DIR"
cd "$R6_DIR"
R6_PROJECT=r6-phone-$(openssl rand -hex 4)
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
phone_compose() {
  docker compose --project-directory . -p "$R6_PROJECT" -f deploy/local/docker-compose-stack.yml -f phone.yml "$@"
}
export STACK_PORT=8216 STACK_MAILPIT_PORT=8217 STACK_RUSTFS_CONSOLE_PORT=8218
export SEED_USER_EMAIL="$R6_LOGIN" SEED_USER_PASSWORD="$R6_PASS"
phone_compose config --quiet
phone_compose --profile setup build
phone_compose up -d --wait --wait-timeout 90
phone_compose run --rm storage-init
phone_compose run --rm setup bun scripts/configure-services.ts
phone_compose run --rm setup bun scripts/seed.ts
curl -fsS "http://$R6_LAN:8216/api/health"
printf '\nCandidate %s | project %s\nMac http://127.0.0.1:8216/auth/login\niPhone http://%s:8216/auth/login\nLogin %s / %s\n' "$R6_SHA" "$R6_PROJECT" "$R6_LAN" "$R6_LOGIN" "$R6_PASS"
```

Compose must support `!override`. Only PocketBase gains a LAN mapping. Mailpit and the storage console remain loopback. On iPhone join the same Wi-Fi, open the printed LAN URL in Safari and sign in. On desktop sign in separately to the printed Mac URL. Start at All Notes on both, with no Garden folder in this fresh account. Record hardware, OS, browser versions, SHA, network and date. A connection error, wrong candidate or missing device leaves the hands-on lines **not tested**.

## SC-006 · run this first

Give the owner only this goal during the timed exercise. Put a stopwatch beside the devices, hide the following physical-check instructions and provide no hints. Start at the first action after sign-in. **On the phone, create Garden and capture a note titled “Seed order” with the body “Buy calendula for the south wall”. On the desktop, find it by the body word and open it.** Stop when the actual desktop note and body are visible. Record seconds, assistance and number of results. Pass requires one correct result in Garden, exact words, elapsed ≤120 seconds and no assistance. Keep the first attempt including failures. Any later attempt gets its own row. Use a fresh synthetic account/stack for a repeat.

## Physical phone · guided verification

1. In Safari open Folders → Garden → Compose. Tap Compose **once** and type `Keyboard check`, Return, then several lines. The software keyboard opens without a second tap, the caret and latest typed line stay above it. Dismiss the keyboard, check the final line is readable and the note remains selected. Wait for Saved. On desktop open the same note and compare the words.
2. On the phone select all writing in this saved test note and clear it. With no attachment, saving must report the validation problem. Tap the app's Back button, choose **Keep editing**, type `Recovered after leave`, wait for Saved and reopen. Pass requires a real leave prompt, retained local state and the repaired text on the desktop after reload. For a native leave check, while the saved note is again invalid and dirty, attempt a Safari reload, choose to stay if prompted, and record the actual Safari behavior separately. If Safari navigates away, record failure/limitation and recreate the synthetic test note for the next step.
3. With the phone editing a saved note, use this block in the same Mac shell to invalidate **only the throwaway user** as in the automated expiry test. Keep the Safari tab open. The Mac loopback stack targets the correct project through the shell function. Do not use a saved admin login or reset the notes-play user.

```bash
phone_compose run --rm -e R6_NEXT="$R6_NEXT" setup bun -e '
import PocketBase from "pocketbase";
const pb = new PocketBase("http://127.0.0.1:8080");
await pb.collection("_superusers").authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
const u = await pb.collection("users").getFirstListItem(pb.filter("email = {:email}", {email: "r6-phone@example.test"}));
await pb.collection("users").update(u.id, {password: process.env.R6_NEXT, passwordConfirm: process.env.R6_NEXT});'
printf 'Temporary replacement password: %s\n' "$R6_NEXT"
```

4. On the phone append `Held for this account` and pause. The now-invalid session must lead to sign-in with the private writing hidden. If a **Sign in** action is offered, tap it. Reauthenticate there as `r6-phone@example.test` with the replacement password. The same note and latest unsaved words must return. Tap **Retry** if offered, wait for Saved, sign in again on desktop and reopen. Pass requires exactly one note with the full repaired text and appended words. Record the actual sequence, including any failure. This proves recovery from server invalidation; no token editing or browser emulation.
5. Stop only this stack from the same shell when finished. `phone_compose down` removes its containers and network, stops LAN exposure and retains the disposable volumes. Record the project for later owner cleanup. The unrelated notes-play stack continues to use its original port.

| Date/time and time zone | Candidate SHA and project | Device, OS, browser/version; desktop pairing | Check | Observed result / seconds / evidence | Pass, fail or not tested |
|---|---|---|---|---|---|
| | | | SC-006 first unaided attempt | | |
| | | | Caret, keyboard open/dismissed, text visible | | |
| | | | Autosave and independent desktop read | | |
| | | | In-app leave guard and native leave observation | | |
| | | | Expiry, same-account draft restoration and final read | | |

Omit credentials from the record. Copy the completed table into the R6 PR and link the evidence from the gate ledger. Any loss or inaccessible capture/find step goes to the bug bar. Android, VoiceOver, external keyboards, OAuth and the future formatting bar retain their separate verification status. [Manual release checks](../../../docs/testing/verification.md#remaining-manual-release-checks)
