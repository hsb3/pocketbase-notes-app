# Live updates quickstart · How to prove it works

All servers and browsers run in the project's capped containers ([testing rules](../../docs/testing/verification.md)). Use disposable accounts A and B, plus a guest client. "A1" and "A2" are two clients or browser contexts signed in as A.

## Commands

```sh
bun run lint && bun run knip && bun run build
make test-api-contained                                # includes scripts/test-live-updates.ts
make test-browser-contained                            # full Chromium + WebKit suite
make test-browser-contained CONTAINED_PROFILE=live     # tests/e2e/live-updates.spec.cjs only, with report
python3 scripts/ai-context.py check && bun run docs:build   # after doc changes
```

The full gate (`.specify/extensions/functionform-gate/scripts/gate.sh full`) runs lint, knip, build and both default suites.

## W1 exit

Server notices, checked in `scripts/test-live-updates.ts` over raw SSE (`fetch` on `/api/realtime`, see [research §3](research.md#3-sdk-subscribe-reconnect-and-pb_connect-pocketbase-028-installed-0282)).

| Scenario (A2 writes; A1, B and guest subscribed) | Expected |
|---|---|
| A2 creates, saves, moves, pins, unpins, deletes, restores a note | A1 gets one notice per write with exactly the [contract keys](contracts/notice.md#event) and the post-write values; a read right after each notice returns that revision |
| A2 deletes a folder holding two notes | A1 gets one notice per note with `deleted: true`, `folder: ""` |
| Same writes | B and the guest get zero `notebook-changes` events; B's `notes/*` record subscription gets zero events |
| B writes its own note | B gets its notice; A1 gets none |
| Stale move (409), invalid pin (400), foreign note (404), stale content save (409), restore past retention (410) | Zero notices to anyone |
| A superuser client subscribed to `notebook-changes` | Zero events |
| Notice payloads | No `user`, `title`, `text`, `body`, `excerpt`, `search_key`, `tasks` or attachment keys |
| A1's client re-subscribes with B's token | 403 from PocketBase |

## W2 exit

Open note, in `tests/e2e/live-updates.spec.cjs` (two contexts of A, 390 / 810 / 1440 px, Chromium and WebKit).

1. A1 and A2 open one note. A2 types until **Saved**. Within 2 s A1 shows the words, **Saved**, and the status "Updated from another device."; A1 then types and reaches **Saved** with no conflict dialog; A2 then shows A1's words.
2. A1 types while its PATCH is held by request interception; A2 saves different words; A1 shows the conflict dialog at once and every local word is still in the editor and in **Copy draft**.
3. A1 is clean. A2 moves the note: A1 keeps the address, shows the new folder in its actions and saves later edits with no conflict.
4. A1 types while its PATCH is held; A2 moves the note; the PATCH is released and gets 409; A1 reaches **Saved** with no conflict dialog, and the server holds A1's words in the new folder.
5. A2 pins, then unpins: A1's note actions offer **Unpin**, then **Pin**; A1 keeps saving.
6. A2 deletes the note: a clean A1 shows **Note unavailable**; a dirty A1 shows unavailable recovery with **Copy draft** and the words intact.
7. While A1 types and saves, its own saves cause zero extra reads of the note (request count).

## W3 exit

Lists, same spec file.

1. A1 shows a folder. A2 creates, edits, pins, moves out, deletes and restores notes: within 2 s after each, A1's rows match a fresh read (title, excerpt, order, pinned marker). **All Notes**, **Pinned** and a search result list behave the same.
2. A1 shows Recently Deleted. A2 deletes, then restores a note, then deletes a folder holding notes: A1's trash rows follow without its heading taking focus.
3. During each update in 1–2: rows stay on screen (no empty state flash), the scroll position and the focused element are unchanged, and text being typed in Search keeps its value and caret.
4. A2 deletes a folder holding 30 notes: A1 performs at most 3 list reads for the burst and ends on the final state.

## W4 exit

Catch-up and fallback, same spec file.

1. A1's `/api/realtime` is aborted by request interception. A2 changes the note and list. A1 is made visible again (`visibilitychange`): within 2 s A1's list and note match the server.
2. A1 goes offline, A2 changes the note, A1 comes back online: A1 catches up within 2 s. Playwright's offline emulation keeps the SSE stream open in both engines and WebKit's fires no `online` event, so the WebKit run dispatches `online` itself; the SDK reconnect (`PB_CONNECT`) path is not exercised by the browser suite.
3. With `/api/realtime` aborted for the whole test, the R3 two-context conflict still appears and every R3 recovery choice works.
4. A1's session expires (the R3 expiry fixture): A2's saves cause no read in A1 until A re-signs in. Then A1 signs out; C signs in in the same tab. A2 (as A) saves: C's tab gets no notice and makes no read for A's note.
5. SC-001: 20 edit-to-visible trials per engine at 1440 px, at least 19 within 2 s; timings recorded in the report.
6. The existing suites stay green. Tests that need a stale second context (R3 conflict, R5 "deleted in another context") abort `/api/realtime` for that context so they keep testing the fallback path.

## W5 exit

`python3 scripts/ai-context.py check` and `bun run docs:build` exit 0; the full gate passes; `docker ps -a` lists no leftover containers.
