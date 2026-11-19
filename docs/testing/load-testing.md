# Load testing

## Check the current notes workload

Run the short functional check from the repository root.

```sh
make test-api-contained CONTAINED_PROFILE=load
```

The contained profile creates two accounts with three notes each. One k6 user exercises
all operations in a 15-second stage. The gate requires a successful request for every
operation, correct summary fields, a stable create ID, an incremented revision and the
expected protected download size. The runner removes its private Docker project afterward.

For a capacity campaign on a disposable machine, use the configuration below. The
measurements on this page predate the switch from entries to folders and notes.

## Historical capacity of the entries workload

Measured 2026-11-15 on one app container limited to **1 CPU and 512 MB**, with the
local stack's settings (rate limiting off, files in RustFS):

- **Comfortable up to about 245 requests/second** (200 simulated users acting about
  once a second): no errors, p95 about 50 ms, p99 under 125 ms, memory near 190 MiB
  (about 250 MiB after eight minutes at that load).
- **The knee is at about 360–390 requests/second** (300–400 simulated users).
  Throughput stops growing there and p95 passes one second.
- **Past the knee the app is killed for exceeding its memory limit.** This happened in
  every pass that pushed beyond the knee, at 500 or 650 simulated users.
- **The first bottleneck is CPU, and logins are the largest single consumer.** With no
  fresh logins the same container served 500 requests/second at p95 12 ms.
- **With rate limiting on, as the Railway setup configures it, the limits bind long
  before the hardware does** when requests share one address: see
  [rate limiting](#rate-limiting).

A simulated user here sends about 1.2 requests a second, far more than a person
writing notes. If a real active user averages one request every 5 to 10 seconds, 245
requests/second is roughly 1,200 to 2,400 people active at the same moment. That
conversion is an assumption, not a measurement.

## Run a capacity campaign

Needs only Docker. From the repo root:

```sh
tests/load/run.sh
```

The default campaign schedules seven one-minute stages with six ten-second gaps, plus
setup and teardown. It builds the self-contained stack as `pbn-load`,
caps the app, configures it the same way `make app` does, creates 200 accounts with
40 notes each, runs k6 in its own container on the stack's network, samples
container resources, prints a results table and removes every container, volume,
network and image it created. Raw output stays in `tests/load/test-results/<run>/`
(ignored by git). It exits non-zero if the app was killed or k6 failed.

The script refuses to start if a stack with the same name exists, because it deletes
the stack's volumes at the end.

| Variable | Default | Meaning |
| --- | --- | --- |
| `STACK`, `STACK_PORT`, `STACK_MAILPIT_PORT`, `STACK_RUSTFS_CONSOLE_PORT` | `pbn-load`, 8240, 8241, 8242 | Stack name and loopback ports |
| `LOAD_APP_CPUS`, `LOAD_APP_MEMORY` | `1`, `512m` | App container limits |
| `LOAD_STAGES` | `50,100,200,300,400,500,650` | Simulated users per stage |
| `LOAD_STAGE_SECONDS` | `60` | Length of each stage (10 s pause between stages) |
| `LOAD_LOGIN_SHARE` | `0.05` | Share of actions that are a fresh login |
| `LOAD_RATE_LIMITS` | `off` | `on` enables PocketBase's default rate limit rules after seeding |
| `LOAD_APP_GOMEMLIMIT` | unset | Go soft memory limit for the app, for example `400MiB` |
| `LOAD_USERS`, `LOAD_ENTRIES_PER_USER` | `200`, `40` | Accounts and notes per account (legacy variable name) |
| `KEEP` | `0` | `1` leaves the stack running for inspection |

After `KEEP=1`, remove the stack with `docker compose -p pbn-load down -v`.

## Current workload

Each simulated user shares an ordinary account with other users and pauses 0.5–1.5
seconds between actions. With the default 5% fresh-login share, the remaining actions
use these weights.

| Action | Share of remaining actions | Requests |
| --- | ---: | --- |
| Browse All Notes | 47% | Request 20 active summaries ordered by update time and ID. Sometimes request page two or open a full note. |
| Browse a folder | 16% | List folders, then request the same projection within the owned Notes folder. |
| Write | 26.5% | Create a rich document at a client-selected ID, or read a previously created note and PATCH its body with the current revision. |
| Attach | 10.5% | Upload a private text or PDF file, create a note referencing it, read file metadata, issue an owner token and download the bytes. |

The separate Chromium editor benchmark measures navigation to a saved note on a cold
and warm HTTP cache. Its contained smoke runs one repetition per fixture and device
profile. The full benchmark runs five. SC-001 measures touch-to-input after the list
has preloaded the editor and has its own timing test.

```sh
make test-browser-contained CONTAINED_PROFILE=performance
```

## Historical measurement setup

**Machine.** Apple M4 Max laptop (16 cores, 48 GB), macOS 27.0.1, Docker Desktop
29.9.3 with 16 CPUs and 12.5 GB given to its Linux VM. Other builds and browser tests
were running on the machine during every pass.

**Limits.** Set in `tests/load/compose.load.yml` on top of the stack's own:

| Container | CPU | Memory | Processes |
| --- | ---: | ---: | ---: |
| App (PocketBase 0.40.1 + built frontend) | 1 | 512 MB, no swap | 256 |
| k6 2.4.0 (pinned by digest) | 2 | 2 GB | 512 |
| RustFS | 2 | 1 GB | 256 |

The app's auto-restart is turned off so a memory kill stays visible. k6 is killed by a
watchdog if it runs longer than the planned stages plus four minutes, and never longer
than 18 minutes.

**Historical workload.** The entries client sent the requests below. Each
simulated user repeated: one action, then 0.5–1.5 s of think time. Several simulated
users share each of the 200 accounts.

| Action | Share | Requests |
| --- | ---: | --- |
| Browse | 45% | Entry list, 20 per page, all/notes/journal/favorites, sometimes page 2; usually opens one entry. One in ten is the Open tasks view |
| Search | 15% | Title search, sometimes within a view, or journal entries for one date; sometimes opens a result |
| Write | 25% | Create an entry with a 2–5 KB document, or open and update one with its revision |
| Attach | 10% | Upload a 16 KB text or 64 KB PDF file, save an entry that references it, read the record, get a file token, download the file |
| Log in | 5% | Password login |

**Reported per stage.** Requests/second, latency percentiles, failed requests, and for
the app container: average CPU from its cgroup counters, peak CPU and memory from
`docker stats` (sampled every 2–3 s), and the share of 100 ms scheduler periods in
which it was throttled at its CPU limit.

**Latency excludes one deliberate delay.** PocketBase sleeps a random time, up to
500 ms, before answering a filtered list that matched nothing, once a client has sent
more than three of those in three seconds. It is an anti-enumeration measure
(`apis/record_crud.go` in 0.40.1), costs no CPU, and showed up as 400–480 ms at p95
from the lightest stage on. Those responses (1.2% of requests) are reported on their
own row, not in the stage percentiles. A user typing a search that matches nothing can
meet this delay.

## Historical results

Two passes of the default run on commit `75e001a` (main at `73524fb` plus the test),
rate limiting off. Each cell is pass 1 / pass 2.

| Simulated users | req/s | p50 ms | p95 ms | p99 ms | Errors % | App CPU (cores) | Throttled periods % | App memory max MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 61 / 62 | 1.4 / 1.6 | 9 / 10 | 65 / 69 | 0 / 0 | 0.23 / 0.25 | 0 / 1 | 127 / 138 |
| 100 | 124 / 124 | 1.2 / 1.1 | 10 / 8 | 59 / 59 | 0 / 0 | 0.38 / 0.37 | 4 / 4 | 145 / 151 |
| 200 | 245 / 246 | 1.2 / 1.1 | 51 / 50 | 109 / 121 | 0 / 0 | 0.65 / 0.62 | 21 / 19 | 188 / 178 |
| 300 | 358 / 357 | 2.6 / 2.0 | 134 / 156 | 306 / 361 | 0 / 0 | 0.85 / 0.84 | 59 / 54 | 244 / 230 |
| 400 | 393 / 385 | 76 / 78 | 969 / 1,192 | 1,687 / 1,969 | 0 / 0 | 0.97 / 0.98 | 91 / 91 | 373 / 355 |
| 500 | 376 / 377 | 177 / 167 | 2,314 / 2,223 | 3,615 / 3,790 | 0 / 0 | 1.00 / 1.00 | 99 / 98 | 476 / 413 |
| 650 | 38 / 35 | – | – | – | 66 / 62 | 1.00 / 1.00 | 100 / 100 | 478 / 474 |

In both passes the app was killed for memory early in the 650-user stage, so that row
mostly measures a dead server. k6 itself peaked at 42% of its 200% CPU allowance.

Spread between the two passes: requests/second within 2% up to 500 users; p95 within
2 ms up to 200 users, 134 against 156 ms at 300 and 969 against 1,192 ms at 400.

Spread across the day is wider. The same run earlier that day (`e88d827`, before
opt-in two-step sign-in was merged), while the machine was busier, gave a knee of
340–370 requests/second, p95 of 219 and 322 ms at 300 users, and one memory kill
already at 500 users. Read the knee as 340–390 requests/second.

p50 / p95 ms per operation, pass 1:

| Operation | 50 | 100 | 200 | 300 | 400 | 500 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Log in | 59 / 72 | 56 / 83 | 55 / 201 | 96 / 512 | 656 / 1,812 | 1,657 / 3,608 |
| Entry list | 2 / 5 | 1 / 3 | 1 / 38 | 2 / 121 | 78 / 566 | 153 / 1,165 |
| Open tasks view | 5 / 10 | 4 / 8 | 4 / 37 | 7 / 101 | 72 / 501 | 172 / 1,163 |
| Search | 1 / 4 | 1 / 2 | 1 / 34 | 2 / 132 | 85 / 605 | 162 / 1,230 |
| Open entry | 1 / 2 | 0 / 1 | 0 / 29 | 1 / 86 | 50 / 411 | 85 / 803 |
| Create entry | 2 / 6 | 2 / 4 | 1 / 26 | 2 / 159 | 176 / 1,534 | 1,126 / 3,146 |
| Update entry | 2 / 6 | 2 / 5 | 1 / 40 | 3 / 202 | 253 / 1,473 | 1,001 / 3,067 |
| Upload file | 7 / 12 | 6 / 11 | 6 / 64 | 8 / 258 | 362 / 1,662 | 1,296 / 3,450 |
| Download file | 1 / 3 | 1 / 2 | 1 / 19 | 1 / 121 | 77 / 465 | 148 / 906 |
| Empty filtered list (deliberate delay) | 1 / 403 | 131 / 463 | 180 / 477 | 222 / 493 | 348 / 879 | 424 / 1,316 |

Single passes with one thing changed (same day, commit `e88d827`):

| Variant | Result |
| --- | --- |
| No fresh logins (`LOAD_LOGIN_SHARE=0`) | 249 req/s at 0.36 cores and p95 6 ms; 499 req/s at 0.73 cores and p95 12 ms, zero errors. Killed for memory in the 600-user stage |
| Constant 200 users for 8 minutes | 243–247 req/s throughout, zero errors, p95 49–79 ms. Memory rose from 197 to 256 MiB and was still creeping up by a few MiB a minute at the end |
| Go memory limit (`LOAD_APP_GOMEMLIMIT=400MiB`) | Same knee, still killed for memory in the 650-user stage |
| Rate limiting on (`LOAD_RATE_LIMITS=on`, stages 10/50/200) | See below |

## First bottleneck: CPU, led by password hashing

How we know it is CPU:

- Requests/second grow in step with users up to 300, then stop growing at 360–390
  while users keep increasing.
- At that point the app uses 0.97–1.00 of its one core and is throttled in over 90% of
  scheduler periods. Memory, k6 (under a quarter of its allowance) and RustFS are not
  at their limits.
- Every operation slows together, including ones that touch no disk, such as issuing a
  file token.

Why logins lead: a login takes 55–59 ms when the app is idle against 1–2 ms for a list
or a save, because PocketBase hashes the password with bcrypt. At 200 users the test
makes about 7 logins a second, which is roughly 0.38 of the 0.62–0.65 cores in use.
Login is also the first operation to degrade (p95 201 ms at 200 users, when lists are
at 38 ms). Removing logins raised the comfortable ceiling from about 245 to about 500
requests/second. So the answer depends heavily on how often people log in: 5% of
actions is deliberately pessimistic, and a morning rush of logins is the realistic
worst case.

Past the knee, writes degrade faster than reads (create p95 1.5 s against 0.6 s for a
list at 400 users), which fits SQLite allowing one writer at a time. That is a second
effect, visible only once CPU is already exhausted.

## Second limit: memory under overload

Memory stays near 130–250 MiB while the app keeps up, then climbs quickly once
requests queue: 230–244 MiB at 300 users, 355–373 at 400, 413–476 at 500, and the
kernel kills the container at 512 MB soon after. A Go soft limit of 400 MiB did not prevent it, so the
memory is not garbage waiting to be collected. What holds it was not established.

The practical meaning: one overloaded instance of this size does not just get slow, it
restarts, and every request in flight fails. In the default stack and on Railway the
restart policy brings it back; this test turns restarts off to make the kill visible.

## Rate limiting

The local stack starts with PocketBase rate limiting **off**, and every result above
uses that real setting. The Railway configuration script (`deploy/railway/configure.ts`)
turns it **on** with PocketBase's default rules: 2 auth requests per 3 s, 20 creates
per 5 s and 300 requests per 10 s on other API paths.

With it on, and all simulated users coming from one address (the k6 container):

| Simulated users | req/s sent | Failed % | App CPU (cores) |
| ---: | ---: | ---: | ---: |
| 10 | 12 | 0.2 | 0.04 |
| 50 | 59 | 6.7 | 0.14 |
| 200 | 204 | 57 | 0.21 |

5,408 of 20,797 requests were answered with HTTP 429. Logins, creates, uploads and
lists were rejected; reads and updates of a single record were not. The hardware was
nearly idle.

What changes between the two settings:

- **Off:** capacity is set by CPU and memory, as in the results above. Nothing stops
  one client from using all of it.
- **On:** the limits are counted per client address. Real users on separate addresses
  each stay far below them, and the hardware figures above still apply. Users who share
  an address (an office, a school, a mobile carrier) share one budget and will see
  rejected logins and saves at very low volume.
- **Not verified:** whether PocketBase on Railway sees each visitor's own address or
  the platform proxy's. If it sees the proxy's, every user shares one budget and the
  site would reject requests at a few logins a second. Check the trusted proxy
  headers setting in the PocketBase dashboard before relying on rate limiting there.

## Limits of the method

- **Local Docker on a laptop.** The app, the load generator and the file store share
  one machine that was also running other work. A 1-CPU cgroup limit on an M4 core is
  not a Railway vCPU: expect lower absolute numbers on slower shared cores. Treat the
  shape (CPU first, logins dominant, memory kill under overload) as the finding and the
  req/s figures as an upper estimate.
- **No network.** Requests travel over a Docker bridge with no TLS and no latency.
  Entry lists return whole documents (about 85 KB a page here), which a real network
  would feel.
- **Single node, SQLite.** One PocketBase process and one database file; there is
  nothing to scale out to. The database was small: 8,000 entries, about 40 MB, at the start
  and on the order of 100 MB at the end of a pass. Large accounts or a database
  larger than memory were not tested.
- **Files go to RustFS** here, as in `make app`. The Railway setup stores files on the
  local volume, which this test did not measure. Files were small (16–64 KB).
- **Short stages.** Each load level ran for one minute, the longest pass for eight.
  Slow growth, backups running under load and the hourly attachment cleanup are not
  covered.
- **Closed model.** Simulated users wait for each response before the next action, so
  an overloaded server receives less load than an open stream of arrivals would send.
- **Synthetic mix.** The action shares are a judgement, not production traffic.
  Realtime subscriptions, password resets, email and signup are not exercised.
- **Two passes** of the main run and one of each variant. The spread above is between
  two samples, not a confidence interval.
