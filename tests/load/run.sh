#!/usr/bin/env bash
# One load-test pass in Docker: build + start a limited stack, seed, run k6, collect, tear down.
# Usage and options: docs/LOAD-TESTING.md
set -euo pipefail
cd "$(dirname "$0")/../.."

STACK=${STACK:-pbn-load}
export STACK_PORT=${STACK_PORT:-8240}
export STACK_MAILPIT_PORT=${STACK_MAILPIT_PORT:-8241}
export STACK_RUSTFS_CONSOLE_PORT=${STACK_RUSTFS_CONSOLE_PORT:-8242}
export LOAD_APP_CPUS=${LOAD_APP_CPUS:-1}
export LOAD_APP_MEMORY=${LOAD_APP_MEMORY:-512m}
export LOAD_APP_GOMEMLIMIT=${LOAD_APP_GOMEMLIMIT:-}
export LOAD_STAGES=${LOAD_STAGES:-50,100,200,300,400,500,650}
export LOAD_STAGE_SECONDS=${LOAD_STAGE_SECONDS:-60}
export LOAD_RATE_LIMITS=${LOAD_RATE_LIMITS:-off}
export LOAD_LOGIN_SHARE=${LOAD_LOGIN_SHARE:-0.05}
export LOAD_USERS=${LOAD_USERS:-200}
export LOAD_ENTRIES_PER_USER=${LOAD_ENTRIES_PER_USER:-40}
RUN_ID=${RUN_ID:-$(date +%Y%m%d-%H%M%S)}
RESULTS=$PWD/tests/load/results/$RUN_ID
export LOAD_RESULTS=$RESULTS LOAD_UID LOAD_GID
LOAD_UID=$(id -u)
LOAD_GID=$(id -g)

die() { echo "load test: $*" >&2; exit 1; }
command -v docker >/dev/null || die "Docker is required."
[[ -f .env ]] || make env

stage_count=$(echo "$LOAD_STAGES" | tr ',' '\n' | grep -c .)
planned=$((stage_count * (LOAD_STAGE_SECONDS + 10)))
# Wall-clock cap for the k6 container: planned stages plus setup allowance, never above 18 minutes.
K6_CAP_SECONDS=${K6_CAP_SECONDS:-$((planned + 240))}
[[ "$K6_CAP_SECONDS" -le 1080 ]] || die "Planned run exceeds the 18-minute k6 cap; use fewer or shorter stages."

compose() {
  docker compose --project-directory . -p "$STACK" \
    -f deploy/local/docker-compose-stack.yml -f tests/load/compose.load.yml "$@"
}
PB=$STACK-pocketbase-1
K6=$STACK-k6

# This script deletes the stack's volumes when it ends, so it never adopts an existing stack.
if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$STACK")$(docker volume ls -q --filter "label=com.docker.compose.project=$STACK")" ]]; then
  die "A stack named '$STACK' already exists. Remove it (docker compose -p $STACK down -v) or set STACK."
fi

sampler_pid=""
watchdog_pid=""
cleanup() {
  status=$?
  [[ -z "$sampler_pid" ]] || kill "$sampler_pid" 2>/dev/null || true
  [[ -z "$watchdog_pid" ]] || kill "$watchdog_pid" 2>/dev/null || true
  if [[ "${KEEP:-0}" = 1 ]]; then
    echo "KEEP=1: stack '$STACK' left running on http://127.0.0.1:$STACK_PORT"
  else
    docker rm -f "$K6" >/dev/null 2>&1 || true
    compose --profile load --profile setup down -v --remove-orphans --rmi local >/dev/null 2>&1 || true
    echo "Stack '$STACK' removed."
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

mkdir -p "$RESULTS"
echo "== build and start '$STACK' (app: $LOAD_APP_CPUS CPU, $LOAD_APP_MEMORY) =="
compose --profile setup build --quiet
compose up -d --wait --wait-timeout 120
compose run --rm --quiet-pull storage-init
compose run --rm --quiet-pull setup bun run scripts/configure-services.ts

{
  echo "run: $RUN_ID"
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "host: $(uname -srm)"
  echo "docker: $(docker info --format '{{.ServerVersion}}, {{.NCPU}} CPUs, {{.MemTotal}} bytes, {{.OperatingSystem}}')"
  docker inspect --format 'app limits: {{.HostConfig.NanoCpus}} nanoCPUs, {{.HostConfig.Memory}} bytes, pids {{.HostConfig.PidsLimit}}' "$PB"
  echo "app GOMEMLIMIT: ${LOAD_APP_GOMEMLIMIT:-unset}"
  echo "stages (VUs): $LOAD_STAGES x ${LOAD_STAGE_SECONDS}s"
} >"$RESULTS/environment.txt"

# docker stats for CPU %/memory; the app's cgroup counters for exact CPU time and throttling.
sampler() {
  while :; do
    now=$(date +%s)
    docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.PIDs}}' \
      "$PB" "$STACK-rustfs-1" "$K6" 2>/dev/null | sed "s/^/$now,/" >>"$RESULTS/stats.csv" || true
    cpu=$(docker exec "$PB" cat /sys/fs/cgroup/cpu.stat 2>/dev/null |
      awk '$1=="usage_usec"{u=$2} $1=="nr_periods"{p=$2} $1=="nr_throttled"{t=$2} END{if (u != "") print u","p","t}') || true
    [[ -z "$cpu" ]] || echo "$(date +%s),$cpu" >>"$RESULTS/cgroup.csv"
  done
}

echo "== k6: seed, then stages $LOAD_STAGES (cap ${K6_CAP_SECONDS}s) =="
compose --profile load run -d --name "$K6" k6 run /load/script.js >/dev/null
sampler &
sampler_pid=$!
(sleep "$K6_CAP_SECONDS" && echo "k6 exceeded ${K6_CAP_SECONDS}s; killing it" >&2 && docker kill "$K6" >/dev/null) &
watchdog_pid=$!
docker logs -f "$K6" 2>&1 | tee "$RESULTS/k6.log" | grep -Ev '^(running|s[0-9]+_|default|setup|teardown|$)' || true
k6_exit=$(docker wait "$K6")
kill "$sampler_pid" "$watchdog_pid" 2>/dev/null || true
sampler_pid=""
watchdog_pid=""

{
  docker inspect --format 'app container: status={{.State.Status}} oom_killed={{.State.OOMKilled}} restarts={{.RestartCount}}' "$PB"
  echo "app database size: $(docker exec "$PB" sh -c 'du -sh /pb/pb_data/data.db | cut -f1' 2>/dev/null || echo unknown)"
  echo "k6 exit code: $k6_exit"
} >>"$RESULTS/environment.txt"
compose logs --no-color pocketbase >"$RESULTS/pocketbase.log" 2>&1 || true

[[ -s "$RESULTS/stages.tsv" ]] || die "k6 produced no summary (exit $k6_exit); see $RESULTS/k6.log"

# Join each stage's time window with the resource samples taken inside it.
awk -F'\t' -v stats="$RESULTS/stats.csv" -v cgroup="$RESULTS/cgroup.csv" -v app="$PB" -v k6="$K6" '
function mib(text,   value) {
  value = text + 0
  if (text ~ /GiB/) return value * 1024
  if (text ~ /KiB/) return value / 1024
  if (text ~ /^[0-9.]+B/) return value / 1048576
  return value
}
BEGIN {
  while ((getline line < stats) > 0) {
    split(line, f, ","); n++
    st[n] = f[1]; sn[n] = f[2]; sc[n] = f[3] + 0; split(f[4], m, " "); sm[n] = mib(m[1])
  }
  while ((getline line < cgroup) > 0) {
    split(line, f, ","); c++
    ct[c] = f[1]; cu[c] = f[2]; cp[c] = f[3]; cth[c] = f[4]
  }
  print "| Stage | VUs | req/s | p50 ms | p95 ms | p99 ms | errors % | app CPU avg (cores) | app CPU max % | throttled periods % | app mem max MiB | k6 CPU max % |"
  print "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
}
{
  cpumax = 0; memmax = 0; k6max = 0; first = 0; last = 0
  for (i = 1; i <= n; i++) if (st[i] >= $3 && st[i] <= $4) {
    if (sn[i] == app) { if (sc[i] > cpumax) cpumax = sc[i]; if (sm[i] > memmax) memmax = sm[i] }
    if (sn[i] == k6 && sc[i] > k6max) k6max = sc[i]
  }
  for (i = 1; i <= c; i++) if (ct[i] >= $3 && ct[i] <= $4) { if (!first) first = i; last = i }
  cores = "-"; throttled = "-"
  if (last > first) {
    cores = sprintf("%.2f", (cu[last] - cu[first]) / 1000000 / (ct[last] - ct[first]))
    if (cp[last] > cp[first]) throttled = sprintf("%.0f", 100 * (cth[last] - cth[first]) / (cp[last] - cp[first]))
  }
  printf "| %d | %s | %s | %s | %s | %s | %s | %s | %.0f | %s | %.0f | %.0f |\n", NR, $2, $6, $7, $8, $9, $10, cores, cpumax, throttled, memmax, k6max
}' "$RESULTS/stages.tsv" >"$RESULTS/stages.md"

{
  echo "# Load test $RUN_ID"
  echo
  sed 's/^/- /' "$RESULTS/environment.txt" "$RESULTS/info.txt"
  echo
  cat "$RESULTS/stages.md"
  echo
  echo "p50 / p95 ms per operation and stage:"
  echo
  cat "$RESULTS/ops.md"
} >"$RESULTS/results.md"

echo
cat "$RESULTS/results.md"
echo
echo "Results: $RESULTS"
if grep -q "oom_killed=true" "$RESULTS/environment.txt"; then
  die "the app container was killed for exceeding its memory limit; later stages measured a dead app"
fi
[[ "$k6_exit" = 0 ]] || die "k6 exited with $k6_exit"
