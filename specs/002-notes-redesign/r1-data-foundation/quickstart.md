# R1 validation on a disposable worktree

Run these steps **during implementation** with Docker, Compose, a working host timeout command and a fresh worktree-local development environment. Only the backend and API proof below fits the single-service recipe. It does not exercise mail, object storage or browsers.

## Focused records gate

Use Bash from the worktree root. Run against a disposable empty `pb/data` in this worktree. Stop if it contains data from another run. Keep the same encryption key throughout. The repository Compose file supplies the PocketBase CPU, RAM and PID caps. Service ports are not published by `compose run` by default. Build steps prepare images, not application servers.

```bash
set -eu
make env
run_id="notes-r1-$(date +%s)-$$"
pb_name="$run_id-pb"
dc=(docker compose --project-directory . -p "$run_id" -f deploy/local/docker-compose.yml)
timeout 1800 "${dc[@]}" build pocketbase
timeout 1800 docker build -t "$run_id-tools" --target tools -f deploy/docker/Dockerfile .
pb_id=$("${dc[@]}" run -d --rm --no-deps --env-from-file .env --name "$pb_name" --entrypoint /bin/sh pocketbase -ec '
  /pb/pocketbase superuser create "$PB_EMAIL" "$PB_PASSWORD" --encryptionEnv=PB_ENCRYPTION_KEY
  exec timeout 1800 /pb/pocketbase serve --http=0.0.0.0:8080 --encryptionEnv=PB_ENCRYPTION_KEY
' )
trap 'docker stop "$pb_id" >/dev/null 2>&1 || true' EXIT
timeout 90 sh -c 'until docker exec "$1" wget -q --spider http://127.0.0.1:8080/api/health; do sleep 1; done' sh "$pb_id"
docker inspect -f '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.PidsLimit}} {{.HostConfig.AutoRemove}}' "$pb_id"
runner=(docker run --rm --cpus 1 --memory 1g --pids-limit 128
  --network "container:$pb_id" --env-file .env
  -e PB_URL=http://127.0.0.1:8080 -e VITE_PB_URL=http://127.0.0.1:8080
  -v "$PWD/scripts:/app/scripts:ro" -v "$PWD/src/services:/app/src/services"
  "$run_id-tools")
"${runner[@]}" timeout 300 bun scripts/seed.ts
"${runner[@]}" timeout 900 bun scripts/test-notes.ts
"${runner[@]}" timeout 300 bun scripts/codegen.ts
```

The PocketBase command forwards disposable credentials from the worktree environment. Use a fresh disposable database on every run of this create-only bootstrap. For public signup proof rerun the service with signup explicitly enabled on its own fresh data; also verify the ordinary disabled path. Inspect the resulting types and run codegen a second time to check for a stable diff.

The focused script must report successful controls and status codes for every identity/operation, Unicode comparison results, retry identity, winning revision and both sets of attachment references. A failed assertion is a nonzero exit. Clean up the instance on every exit, verify it is gone and clean only this run’s disposable resources. Run the entire orchestration with an outside 30-minute deadline as well. Remove only this run’s empty Compose network, image tag and disposable data after inspecting their exact identifiers. Record commands, limits, statuses and remaining gaps in the R1 PR.

## Required wider gates and known runner gaps

- Use the existing full-stack definitions under `deploy/local/` for Mailpit, RustFS, PocketBase and setup. Each service must inherit its CPU/memory/PID limits and run with a wall-clock deadline and automatic removal. Start only run-owned containers, e.g. service-specific `compose run --rm --no-deps` with an outside deadline and guaranteed cleanup; give dependencies their expected network aliases. Apply a 30-minute maximum per run. Bind no extra host ports. Check limits/auto-remove with inspect before running tests.
- Run the existing quality commands (`bun run lint`, `bun run knip`, `bun run build`, scripts type-check) and documentation checks. Run the old entries/attachments/API suites as well as the new notes tests. For full acceptance, run the unchanged app journey in headless Chromium **and** WebKit in a capped, timed, automatically removed browser container matching the locked Playwright version; check 390/810/1440. Share the disposable service network namespace and use its loopback address so the local-only guard stays effective. Use the built web app or run Vite **inside** the capped container.
- **Runner gaps before implementation.** Plain `make start` starts host Vite. Plain `make e2e` can start host browsers/Vite. The existing full-stack `up` starts persistent services; some API/account scripts call Docker Compose from their runner and expect ordinary Compose services. The admin schema UI likewise needs a containerized browser that can reach the disposable backend. These paths have not been verified with the required lifetime and network constraints. Supply a compliant disposable runner for those gates, or explicitly report the specific gate blocked. Never substitute a host browser/server or weaken the local address guards. CI must also satisfy the rule for any new test run under this assignment.
