#!/usr/bin/env bash
# functionform gate. Usage: gate.sh full|stop
#   full: run the `full:` command, exit with its status.
#   stop: run the `quick:` command for the agent's stop event; exit 2 (block) when it fails.
set -uo pipefail
mode="${1:-full}"

root="$PWD"
while [ ! -d "$root/.specify" ] && [ "$root" != "/" ]; do root="$(dirname "$root")"; done
[ -d "$root/.specify" ] || { echo "gate: no .specify project at or above $PWD" >&2; exit 1; }
cd "$root" || exit 1
cfg=".specify/extensions/functionform-gate/functionform-gate-config.yml"

# shortcut: reads one-line `key: value` pairs with sed, not a YAML parser; upgrade if values need multiple lines.
value() { sed -n "s/^$1:[[:space:]]*//p" "$cfg" 2>/dev/null | head -1 | sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

if [ "$mode" = full ]; then
  cmd="$(value full)"
  [ -n "$cmd" ] || { echo "gate: no gate command set. Set 'full:' in $root/$cfg" >&2; exit 1; }
  echo "gate: $cmd"
  bash -c "$cmd"; status=$?
  [ "$status" -eq 0 ] && echo "gate: PASS" || echo "gate: FAIL (exit $status)" >&2
  exit "$status"
fi

[ "$mode" = stop ] || { echo "gate: unknown mode '$mode' (full|stop)" >&2; exit 1; }
payload="$(cat 2>/dev/null || true)"
# The agent is already continuing because of this hook: let it stop, so a failing gate cannot loop forever.
printf '%s' "$payload" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0
cmd="$(value quick)"
[ -n "$cmd" ] || exit 0

# Skip when this exact tree already passed.
# shortcut: the key ignores content edits inside untracked files; upgrade if stale passes show up.
stamp="$(git rev-parse --git-dir 2>/dev/null)/functionform-gate-pass"
key="$( { echo "$cmd"; git rev-parse HEAD; git status --porcelain; git diff HEAD; } 2>/dev/null | shasum | cut -d' ' -f1)"
[ -f "$stamp" ] && [ "$(cat "$stamp")" = "$key" ] && exit 0

out="$(bash -c "$cmd" 2>&1)"; status=$?
if [ "$status" -eq 0 ]; then echo "$key" > "$stamp" 2>/dev/null; exit 0; fi
{ echo "functionform gate failed (exit $status): $cmd"; printf '%s\n' "$out" | tail -40; echo "Fix the cause, then finish. Do not change the gate command."; } >&2
exit 2
