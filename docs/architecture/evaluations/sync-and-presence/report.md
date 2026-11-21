# Multi-device sync, edit queue and presence: evaluation

**Decision.** Which write-coordination, edit-queue and presence approach should PocketBase Notes adopt so one writer can use several devices at once without losing words or seeing spurious conflicts?

**Date.** 2026-11-21. Every claim is point-in-time and comes from primary sources: repositories, LICENSE files, official docs, npm metadata and the PocketBase source. 11 decision-critical claims were re-checked adversarially: 9 verified, 2 corrected. The corrections were PocketBase's 30-minute maximum connection time, and Yjs's commit share (86%) and the prerelease status of `@y/prosemirror`. Three server-side loading claims were also proven in a contained run. Evidence: [requirements](data/requirements.yaml), [rubric](data/eval-rubric.yaml), [practitioner landscape](data/landscape.yaml), and one findings file per candidate in [data/findings/](data/findings/).

## 1. Executive summary

No single package is the answer, because the problem splits into three layers that the market solves separately. Every successful notes app keeps them apart: small fields such as pin and folder use per-field last-writer-wins, the body gets ordered saves (or a merge), and presence is a short-lived side channel.

1. **Write coordination, now.** Give metadata its own write path that never touches the content revision (`field-version-baseline`). That removes the false conflict the R7 plan would have created. Our design has the same flaw as Standard Notes, Joplin and Bear. Figma and Linear avoid it with property-level resolution. No package does this for a PocketBase schema; it is a few lines in our hooks.
2. **Live updates and presence, next.** Use PocketBase realtime, which is MIT, already in the image, and scoped to the owner without extra code. Our raw-SQL note actions emit no events today, so they must broadcast explicitly. Clients must refetch after every reconnect, because PocketBase cuts each connection at least every 30 minutes and never replays missed events.
3. **Merged body edits and a durable queue, only when wanted.** Use Yjs through ProseKit's existing Yjs extension. A contained run showed PocketBase 0.40.1's JSVM can decode a Yjs note back to ProseMirror JSON, so titles, search and Open Tasks keep working. The transport is either Hocuspocus (MIT, a second process) or our own PocketBase routes.

The incumbent, one revision per note, fails `no-false-conflict` (confirmed in our code).

## 2. Comparison matrix

Legend: ✅ yes, free and OSS · ◐ partial (see note) · 💰 paywalled · ❌ no (confirmed) · ❓ not documented · 🧪 proven in our contained run.

Capabilities, in column order: no false conflict (NFC), text merge (TM), edit queue (EQ), presence (Pr), live update (LU), ProseMirror binding (PM), PocketBase auth (Auth), server derivation (SD), single image (1img).

| Candidate (layer) | License · filters | NFC | TM | EQ | Pr | LU | PM | Auth | SD | 1img | Maturity |
|---|---|---|---|---|---|---|---|---|---|---|---|
| field-version-baseline (write coordination, hand-built) | n/a · baseline | ✅ | ❌ | ◐¹ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | n/a |
| pocketbase-realtime (transport) | MIT · pass | ❌ | ❌ | ❌ | ◐² | ◐³ | ❌ | ✅ | ✅ | ✅ | at-risk⁴ |
| yjs (CRDT and awareness) | MIT · pass | ✅ | ✅ | ◐⁵ | ◐ | ◐ | ✅ | ❌⁶ | 🧪 | ◐ | adequate |
| hocuspocus (Yjs server) | MIT · pass | ✅ | ✅ | ◐⁵ | ✅ | ◐ | ✅ | ◐ | ✅ | ◐⁷ | adequate |
| prosemirror-collab (step authority) | MIT · pass | ◐ | ✅ | ◐ | ❌ | ◐ | ✅ | ◐ | 🧪 | ✅ | at-risk⁴ |
| tanstack-offline (client outbox) | MIT · pass | ◐ | ❌ | ✅⁸ | ❓ | ◐ | ❌ | ✅ | ✅ | ✅ | early |
| loro (CRDT) | MIT · pass | ✅ | ✅ | ◐ | ◐ | ◐ | ✅ | ❌ | ◐⁹ | ◐ | early |
| tinybase (local-first store) | MIT · pass | ✅ | ❌ | ◐ | ❓ | ◐ | ❌ | ❓ | ◐ | ◐ | adequate, one person, activity down 82% |
| note-revision-baseline (incumbent) | n/a · baseline | ❌ | ❌ | ◐¹ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | n/a |
| automerge (CRDT) | MIT · pass | ✅ | ✅ | ◐ | ◐ | ◐ | ◐ | ❌ | ◐⁹ | ◐ | at-risk: binding fails recency |
| replicache-zero (sync engine) | npm tarball defers to the vendor's terms of service · **unverified** | ✅ | ◐ | ✅ | ❓ | ◐ | ❌ | ✅ | ✅ | ✅ | maintenance mode |
| y-sweet (Yjs server) | MIT · **unverified** (PocketBase as the store) | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ | ◐ | ◐ | at-risk: no commits since 2025-12 |
| sharedb (OT server) | MIT · **fail** (PocketBase as the store) | ◐ | ◐ | ◐ | ✅ | ◐ | ❌ | ◐ | ◐ | ❌ | at-risk |
| powersync (sync engine) | Apache-2.0 since 2026-11-03 · **fail** (PocketBase as the store) | ◐ | ◐ | ✅ | ❓ | ✅ | ❌ | ◐ | ✅ | ❌ | adequate |
| electric (sync engine) | Apache-2.0 · **fail** (PocketBase as the store) | ◐ | ◐ | ◐ | ◐ | ✅ | ◐ | ◐ | ◐ | ❌ | adequate, main branch idle since 2026-10-06 |

Notes:

1. In-memory, serialized autosave queue in one tab with retry and reconciliation (`src/features/notes/draft.ts`). It does not survive a reload.
2. Presence can be built from documented hooks: `$app.subscriptionsBroker()` plus code after `e.next()` in `onRealtimeConnectRequest`, which runs after disconnect. The server sends no heartbeat, so a phone that silently drops off shows as present until the 5-minute idle timeout. The client must send its own heartbeat.
3. Delivery is at most once, with no event ids and no replay, and every connection is cut at least every 30 minutes (`MaxTimeout`, a correction found in verification). Two gaps in our code: raw-SQL note actions emit no event, and the `deleted = ""` list rule hides soft deletes from collection subscribers.
4. One maintainer and no institutional backing, which fails the breadth floor. Neither is eliminated: PocketBase and ProseMirror are platform dependencies we already carry, and no option here removes them. PocketBase also moved off GitHub on 2026-10-26 to a new Go module path (`ganigeorgiev.com/pocketbase/pocketbase`, v0.42.3). This affects upgrades, not this decision.
5. Changes survive a reload only with `y-indexeddb`, whose last release was 2023-11-02.
6. Yjs has no transport or auth of its own. Both come from Hocuspocus or our own routes.
7. A second always-on process, Bun or Node 22+, on its own WebSocket port. `extension-sqlite` needs the native `better-sqlite3` addon, and whether it runs under Bun is unverified.
8. IndexedDB outbox, processed serially in creation order, with an `idempotencyKey` per transaction. Only the leader tab is durable; other tabs write online-only. `@tanstack/db` is still 1.0.0-rc.
9. WebAssembly only, and goja has none, so server decoding needs a custom Go build of PocketBase.

## 3. Shortlist profiles

**field-version-baseline (hand-built).**
- *What it is:* content saves check only the content revision. Pin, move, delete and restore update their own columns and never bump that revision. Pin and move are per-field last-writer-wins, the pattern Figma documents for multiplayer properties and Linear uses for issue fields ([landscape](data/landscape.yaml)).
- *Strength:* it removes the only false conflict our design creates, with no new dependency and no new service.
- *Caveat:* constitution III currently says any new write path to an entry must use the revision check. Following this needs an owner-approved amendment to say "any write to note content". The amendment would keep the rule's purpose, that unsaved words are never overwritten, because a metadata write cannot overwrite words.
- *Effort:* small. It touches `pb/hooks/note-actions.pb.js`, R5's `confirms` logic and the R7 plan.

**PocketBase realtime.**
- *Maturity:* in the image today. Server and SDK are MIT, and the SDK has 308k npm downloads a week. The upstream is one maintainer who moved off GitHub in October 2026.
- *Strength:* owner-scoped record subscriptions come from the existing list and view rules with no new code, and custom topics give us presence.
- *Caveats:*
  - Delivery is at most once with forced reconnects every 30 minutes, so every view must refetch on reconnect.
  - Note actions must broadcast explicitly, because raw SQL emits nothing.
  - Each held SSE connection occupies a JSVM runtime from the pool of 15.
- *Effort:* native for live updates; our own code (DIY) for presence.

**Yjs (with ProseKit's Yjs extension).**
- *Maturity:* 23k stars and 17.5M npm downloads a week. The main author wrote 86% of commits in the window, and the issue backlog is growing.
- *Strength:* real merging of concurrent body edits, plus awareness for cursors and presence, through ProseKit's own extension, so the editor stays.
- *Proof:* in a capped Docker run, PocketBase 0.40.1's JSVM decoded a Yjs update to the same ProseMirror document Bun produced, in 0.76 ms on average. It needed a `crypto.getRandomValues` stub, a base64 decoder and a single 172 kB minified bundle.
- *Caveats:*
  - Memory per pooled VM, large notes and request-path hooks were not measured.
  - v14 renames the packages (`@y/y`, `@y/prosemirror` 2.0 prereleases).
  - A durable local queue depends on the stale `y-indexeddb`.
- *Effort:* a documented adapter on the client. On the server, a new storage format and a rework of R3's save path.

**Hocuspocus.**
- *Maturity:* 4 recurring contributors, backed by Tiptap GmbH. v4.9.0 released 2026-11-20; server 2.3M npm downloads a week. All 13 packages are MIT with no paid tier.
- *Strength:* the off-the-shelf Yjs server, with authentication, persistence hooks and awareness.
- *Caveat:* a second process in the image, and a PocketBase token check that we write in `onAuthenticate`.
- *Effort:* a documented adapter plus our own PocketBase glue.

**TanStack offline transactions.**
- *Maturity:* MIT, but pre-1.0, and the package has only 2 recurring contributors.
- *Strength:* the most complete off-the-shelf durable outbox that fits a custom backend.
- *Caveat:* only the leader tab is durable. It adds two new dependencies, and today's scope (online only) does not need durability across reloads.

## 4. Rejected

| Candidate | Category | Reason |
|---|---|---|
| ElectricSQL | Fails `pocketbase-record` | Requires Postgres. |
| PowerSync | Fails `pocketbase-record` | Source databases are Postgres, MongoDB, MySQL, MSSQL and Convex only, and it needs MongoDB or Postgres for its own storage. It is Apache-2.0 since 2026-11-03, with telemetry on by default (opt-out). |
| ShareDB | Fails `pocketbase-record` | MongoDB or Postgres adapters only, and no ProseMirror binding. |
| Y-Sweet | `pocketbase-record` unverified; at-risk | Stores documents in its own folder or S3. No commits since 2025-12-04; Jamsocket was acquired by Modal. |
| Replicache / Zero | `osi-license` unverified | The shipped npm tarball points to the Rocicorp terms of service, though the source repo is Apache-2.0. Replicache is in maintenance mode, and Zero requires Postgres. |
| Automerge | Maturity (binding) | `@automerge/prosemirror` is "beta quality" with no commit since 2026-02-25. The engine is WebAssembly only, about 1.1 MB gzipped. |
| Loro | Not eliminated; down-ranked | Early. The binding had its last commit 91 days ago. WebAssembly only, about 1.2 MB gzipped, and no official Go binding. It is the best CRDT alternative if Yjs falters. |
| TinyBase | Not eliminated; down-ranked | Merges per field, but the body is last-writer-wins. One maintainer, and activity is down 82%. |
| Screened quickly | | Fails a filter: Triplit (AGPL, own database, stale), Jazz, Instant, Evolu, Dexie Cloud (self-hosted server is paid). Too young or stale: cr-sqlite (stale), pb-offline-sync and pb-offline. RxDB's free build lacks the IndexedDB storage, which is in the paid Pro tier. LiveStore (event log becomes the record). |

## 5. Recommendation and risks

**Recommended path, in order:**

1. **R7, revised:** metadata gets its own write path (field-version-baseline). Pin is per-field last-writer-wins and does not bump the content revision, so a pin never refuses a body save on another device. This needs the owner's amendment to constitution III. A cheap upgrade worth adopting from Standard Notes: when the server still holds the revision the client started from, accept the save.
2. **A new increment:** live updates and presence on PocketBase realtime. Note actions broadcast explicitly. Each client sends a heartbeat on a presence topic and the server drops stale entries. Views refetch after every reconnect. Show "Open on another device" in the editor. No new dependency.
3. **Deferred:** merged co-typing and a durable queue. Prototype Yjs inside the ProseKit editor, stored as a PocketBase field and decoded by the hook (proven). Compare two transports: Hocuspocus, and our own PocketBase routes plus realtime. Adopt only if the owner wants live co-typing or crash-proof drafts. Today's scope (one writer, online) does not need it. If the body merge is wanted without a CRDT, the next thing to evaluate is the three-way text merge Obsidian and Simperium use (diff-match-patch); it was not evaluated here.

**Risks to validate:**
- **PocketBase upstream.** One maintainer, moved off GitHub, new Go module path, and we pin 0.40.x while upstream is at 0.42.3. *Mitigation:* open an issue to plan the move and repoint dependency tooling; keep the SHA-pinned binary.
- **Realtime limits.** Forced 30-minute reconnects, no replay, and JSVM pool use per connection. *Mitigation:* make "refetch on reconnect" part of the increment, and load-test 2–3 devices per owner in the contained stack.
- **Yjs server path.** Memory per pooled VM and large-note decode time are unmeasured. *Mitigation:* measure both in the prototype before committing.

**Stated bias.** These weights favour removing false conflicts and keeping server-side derivation (search, titles, Open Tasks) over live text merging, because the scope is one writer on several devices. Add sharing or offline-first and Yjs moves from deferred to required.

## 6. Sources and method

Primary sources per candidate, with dates and verification blocks, are in [data/findings/](data/findings/). Key ones:
- **PocketBase:** [realtime API](https://pocketbase.io/docs/api-realtime/), [JSVM realtime](https://pocketbase.io/docs/js-realtime/), [event hooks](https://pocketbase.io/docs/js-event-hooks/), [GitHub archive notice](https://github.com/pocketbase/pocketbase).
- **Yjs:** [Yjs](https://github.com/yjs/yjs), [y-prosemirror](https://github.com/yjs/y-prosemirror).
- **Hocuspocus:** [license](https://github.com/ueberdosis/hocuspocus/blob/main/LICENSE.md), [v4 release notes](https://github.com/ueberdosis/hocuspocus/blob/main/RELEASE_NOTES_V4.md), [authentication guide](https://tiptap.dev/docs/hocuspocus/guides/authentication).
- **prosemirror-collab:** [collab guide](https://prosemirror.net/docs/guide/#collab).
- **TanStack:** [Query](https://github.com/TanStack/query), [DB](https://github.com/TanStack/db).
- **Loro:** [loro-prosemirror](https://github.com/loro-dev/loro-prosemirror).

Prior-art evidence (Figma, Linear, Standard Notes, Simperium, Logseq, Obsidian, Apple Notes and others) is in [landscape.yaml](data/landscape.yaml). It is used for patterns, never for capability verdicts.

**Method.**
- **Maturity window:** 2026-05-21 to 2026-11-21, from the GitHub API and npm downloads.
- **"No" versus "not documented":** "no" only when docs state it or the design excludes it.
- **Contained proof:** Docker, capped at `--cpus 2 --memory 4g --pids-limit 512`, with the PocketBase 0.40.1 binary checksum verified. Its scripts and logs stayed in session scratch storage and are not committed.
