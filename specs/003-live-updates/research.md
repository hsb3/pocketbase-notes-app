# Live updates research

Every decision below was settled by reading current `main` (`fe0b749`), the installed `pocketbase` JS SDK 0.28.2 (`node_modules/pocketbase/dist`), the JSVM type definitions the pinned server generates (`pb/data/types.d.ts`, untracked), and the PocketBase v0.40.1 source and docs. Claims marked *source reading* were not run; W1 and W2 tests prove them.

Sources:
- [S1] PocketBase v0.40.1 `apis/realtime.go`: `realtimeConnect`, `realtimeSetSubscriptions`, `bindRealtimeEvents`, `realtimeBroadcastRecord`.
- [S2] PocketBase v0.40.1 `tools/subscriptions/client.go`.
- [S3] [JSVM event hooks](https://pocketbase.io/docs/js-event-hooks/) (docs header v0.42.3).
- [S4] [JSVM realtime](https://pocketbase.io/docs/js-realtime/), "Sending custom messages".
- [S5] `pb/data/types.d.ts`: `SubscriptionMessage`, `subscriptions.Broker`, `subscriptions.Client`.
- [S6] SDK `RealtimeService` in `node_modules/pocketbase/dist/pocketbase.es.mjs` and `.d.ts`.
- [S7] The [sync evaluation](../../docs/architecture/evaluations/sync-and-presence/report.md) and its [PocketBase realtime findings](../../docs/architecture/evaluations/sync-and-presence/data/findings/pocketbase-realtime.yaml).

## 1. How a raw-SQL write produces a realtime event

- **Facts.**
  - Record events are broadcast only from model hooks: `OnModelAfterCreateSuccess`, `OnModelAfterUpdateSuccess`, and `OnModelDelete` plus `OnModelAfterDeleteSuccess` [S1]. `tx.db().newQuery(...).execute()` fires none of them, so move, delete, restore, pin and the folder-delete cascade emit nothing today [S1, S7].
  - For a `notes/*` subscription the server checks the collection **ListRule** against the record's state after the write. For `notes/<id>` it checks the **ViewRule** [S1]. Our list rule requires `deleted = ''` (`pb/migrations/1795000400_active_notes_and_purge.js`), so even a model-hook update that soft-deletes a note would reach no `notes/*` subscriber.
  - A hook can send its own message: `new SubscriptionMessage({ name, data })`, then loop over `$app.subscriptionsBroker().clients()`, check `client.hasSubscription(name)` and call `client.send(message)` [S4, S5]. The subscribing request's auth record is stored on the client under the key `"auth"` (`RealtimeClientAuthKey`) [S1], and is `null` for a guest.
- **Decision.** A custom topic, `notebook-changes`, fed by one shared helper `pb/hooks/note-notice.js`. It sends a **change notice** (state markers, no content, see [the contract](contracts/notice.md)) to every client that has the exact subscription and whose stored auth is a `users` record with the note's owner ID. It is called:
  - by `onRecordAfterCreateSuccess` and `onRecordAfterUpdateSuccess` for `notes` (ordinary creates and content saves);
  - by the move, delete, restore and pin routes in `pb/hooks/note-actions.pb.js`, after `runInTransaction` returns;
  - by the folder-delete path in `pb/hooks/folders.pb.js`, once per affected note, after its transaction returns.
- **Why after the transaction.** `onRecordAfter*Success` is "delayed and executed only AFTER the transaction has been committed" and "NOT triggered in case the transaction fails/rollbacks" [S3]. The action routes call the helper only after `runInTransaction` returns without throwing, so a refused (400, 404, 409, 410) or rolled-back write sends nothing. A client that reacts to a notice by reading always sees the committed state.
- **Why one channel for every write.** The client listens to one topic with one validator. The notice shape does not depend on which write path ran. The record subscription would also deliver full bodies to every list view, which the list cannot use: `excerpt` is computed only on list reads (`onRecordsListRequest` in `pb/hooks/notes.pb.js`).
- **Topic name.** A subscription matches record broadcasts only through prefixes built from a collection name or ID (`<name>/…?`, `<name>?`) [S1, S2]. Collection names are word characters only (*source reading*), so a hyphenated topic can never receive record events, even if a `notebook` collection is created later.
- **Alternatives rejected.**
  - *Switch the actions to `tx.save(record)`.* `onRecordValidate` for notes refuses any folder change and any `deleted` value, so move, delete and restore cannot save through it without weakening the validator. A save also advances the `updated` autodate, which breaks R7 FR-005 (a pin is not an edit). And the list rule still hides soft-deleted notes from `notes/*` subscribers.
  - *Trigger `$app.onModelAfterUpdateSuccess().trigger(...)` by hand.* It fires every other handler on that hook too, depends on constructing internal event objects, and still hits the list-rule gap.
  - *Per-user topic names (`notebook-changes/<userId>`).* They add nothing to privacy: the server must check the stored auth either way, because any client can subscribe to any topic string [S1].

## 2. Privacy: another account and guests never receive a notice

- **Decision.** The helper sends only when `client.get("auth")` is a `users` record whose ID equals the note's `user`. It never sends to guests, superusers or other accounts. The record rules are not consulted, so the owner check is the whole guard and the API test covers it directly.
- **Supporting facts.**
  - Auth is bound at the subscribe POST. A later POST with a different auth on the same client gets 403 "The current and the previous request authorization don't match." [S1]. One connection can never switch owners.
  - The server clears a client's stored auth when that user's token key changes, the user is deleted, or the auth collection secret changes [S1].
  - The notice carries no title, writing or folder name (FR-015), so the worst a misdelivery could leak is an ID and revision. The test still requires zero notices for B and the guest.
- **Known limit.** A token that expires mid-connection stays bound until the connection ends (at most 30 minutes) [S1]. The client closes its subscription when the session ends (§5), and notices carry no content, so this exposes nothing new to that same tab.

## 3. SDK subscribe, reconnect and `PB_CONNECT` (pocketbase ^0.28, installed 0.28.2)

- **Facts** [S6].
  - `pb.realtime.subscribe(topic, cb)` opens one `EventSource` per client and POSTs the topic list with the current auth token. It resolves to an unsubscribe function. When the last listener goes, the connection closes.
  - On every connect, including the first, the SDK stores the new `clientId` from `PB_CONNECT`, **resubmits every subscription**, then calls listeners subscribed to the `PB_CONNECT` topic.
  - Reconnects retry forever (`maxReconnectAttempts = Infinity`) with backoff `[200, 300, 500, 1000, 1200, 1500, 2000]` ms, **but only after a first successful connect.** If the very first connect fails, the pending `subscribe()` promise rejects and the SDK stops (`connectErrorHandler`: no `clientId` and no reconnect attempts).
  - `onDisconnect(activeSubscriptions)` is called on every drop.
  - The server sends `PB_CONNECT` with `{"clientId": …}`, cuts idle connections after 5 minutes with nothing sent, and cuts every connection after 30 minutes. Each connection gets a new random 40-character client ID. No missed message is replayed [S1, S2, S7].
- **Decision.**
  - `src/features/notes/live.ts` subscribes to `notebook-changes` and `PB_CONNECT` while the authenticated workspace is mounted, and unsubscribes both on unmount, including on a session or account change (FR-013).
  - Every `PB_CONNECT` after the first triggers a catch-up (§6).
  - A rejected first `subscribe()` is retried on the next `visibilitychange` to visible and on `online` (FR-014). The app never depends on the connection to save.
  - No visible connection indicator (spec clarification: no new UI).
- **Not used.** `onDisconnect` (a reconnect already triggers catch-up), and record subscriptions (`notes/*`), see §1.
- **Testing consequence.** Bun 1.4 has no global `EventSource` (`bun -e "console.log(typeof EventSource)"` prints `undefined`). The API test therefore reads the SSE stream with `fetch` and posts the subscription itself, through the same two endpoints the SDK uses. This needs no new dependency.

## 4. A remote change versus the pending and in-flight autosave

Today's save path (`src/features/notes/draft.ts`): one write at a time; edits during a write stay pending; a 409 or ambiguous failure runs `reconcile()`, which reads the note and compares it with the submissions and the baseline.

- **Decision: a notice first decides whether a read is needed.** A notice for the open note is ignored when its revision is below the draft's, or equal with the same folder, not deleted, and a `pinned` value that is missing or matches the local pin. That covers the echo of every save and action this device made, so own changes cause no extra read (FR-006).
- **Decision: no catch-up while the note is busy (FR-007).** While `draft.busy` (a save is running), a pin request is in flight (`pin.busy`), a note action is pending (`command.current`), a leave or sign-out choice is open (`pending.current`), or the conflict dialog is showing, the newest notice is kept and nothing is read. When the save is acknowledged, the action ends or the dialog closes, the kept notice is checked again against the new baseline. An own save's echo then matches and is dropped.
- **Decision: pause autosave during the catch-up read.** `draft.pause()` before `getNote`, then `resume()` afterwards. Without this a 500 ms autosave timer could fire mid-read and send the old revision, and that save would turn a metadata-only change into a 409.
- **Decision: one `NoteDraft` method, `remote(note)`, applies the read result:**

  | Saved note compared with the draft's baseline | Draft clean | Draft dirty |
  |---|---|---|
  | Same revision and folder | update the pin only | update the pin only |
  | Body and attachments equal, only folder or revision differ (a move elsewhere) | adopt folder and revision | adopt folder and revision, keep the unsaved edits and resume autosave (FR-004) |
  | Body or attachments differ | `replaceSaved`: new body, `editorVersion++`, acknowledge, announce (FR-002, FR-005) | `changedElsewhere()`: R3 conflict, autosave stops, dialog opens (FR-003) |
  | Read is 404 or the note is deleted | existing `missing()`: **Note unavailable** | existing `missing()`: unavailable recovery with **Copy draft** |

  `replaceSaved` and `changedElsewhere` already exist and are used by `checkAction` in `workspace.tsx`. The metadata-only branch generalises `adoptMove`, which already adopts this device's own move.
- **Decision: the same metadata-tolerant comparison in `reconcile()`.** If a save in flight gets 409 because another device moved the note, and the read shows the baseline's body and attachments under a new folder or revision, `reconcile()` adopts them and returns `"replay"`. The draft is then written once more on the new revision. Today that case shows a false conflict.
  - **Safe under constitution III.** The replay still sends a revision and goes through the server's 409 check. It is only allowed when the server's words equal the words the draft started from, so it cannot overwrite anything. A content save that lands in between makes the replay fail with 409 and the conflict dialog shows as before.
- **No false 409 from the notice path itself.** The client never writes because of a notice. It only reads and moves its baseline forward. Every write still carries the revision the client last confirmed.
- **Residual race (accepted).** If both devices type within the delivery window (about one autosave), one save is refused and the conflict dialog shows. That is a real concurrent edit, which the spec keeps as a conflict (Story 1.5).

## 5. Session and account changes

- **Decision.** The subscription lives in an effect of `Library` in `src/features/notes/workspace.tsx`. `Library` renders only for a current binding, and `Workspace` unmounts it on every auth-store change, so the effect cleanup unsubscribes before the next account's library mounts. Each notice is also dropped unless `session.current()` holds. A new subscription opens a new connection, with a new client ID, under the new token.
- **Rationale.** The server refuses an auth change on an existing client (§2), so reusing the connection across accounts would fail anyway.

## 6. Catch-up on focus and reconnect

- **Decision.** One `catchUp()` in `Library` runs on `visibilitychange` to visible, on every `PB_CONNECT` after the first, and after a retried first connect succeeds. It:
  - reloads the visible list (coalesced, §7);
  - quietly reloads Recently Deleted when it is shown;
  - re-reads folders;
  - treats the open note as if a notice with an unknown revision arrived, so it reads and applies `remote()` unless the note is busy.
- **Rationale.** Notices are at most once with no replay, and connections end at least every 30 minutes [S1, S7]. Recently Deleted already re-reads on `visibilitychange` (`recently-deleted.tsx`), and this extends that pattern.

## 7. Lists: coalescing and stable rows

- **Facts.** `NoteList` clears its rows while a refresh is loading (`current` requires `reply.refresh === refresh`) and shows an error state on failure. `RecentlyDeleted`'s `refresh` prop runs `enter()`, which clears rows and focuses the heading. Its `visibilitychange` path runs a quiet `load()` instead.
- **Decision.**
  - The first notice or catch-up opens a 250 ms window; notices inside it are merged, and the `live` counter is bumped once when it closes. That is at most four reloads per second, cannot be starved by a steady stream, and ends on the latest state (FR-009). A plain trailing debounce was rejected because a steady stream of saves elsewhere would postpone the reload indefinitely.
  - `NoteList` gets a `live` prop that re-reads without clearing the rows shown. A failed live read keeps the rows. Page, scroll and focus are untouched because the existing focus restoration runs only on a new `entryKey`. The search field keeps its local `field` state.
  - `RecentlyDeleted` gets a `live` prop that runs the existing quiet `load()`, not `enter()`.
- **Alternative rejected.** *Patch rows from the notice.* The notice has no title or excerpt (FR-015), and ordering depends on server sort keys. Reading the list again reuses the validated reader.

## 8. Deployment and cost

- No schema change, so no migration and no codegen.
- No new dependency. The SDK and server realtime already ship in the image.
- No `onRealtimeConnectRequest` hook is added, so held connections do not occupy a JSVM runtime [S7].
- Each content save runs one extra pooled JSVM call and walks the broker's clients, which is negligible at personal scale.
- SSE passes through the app's single port. The server sets `X-Accel-Buffering: no` [S7]. The Railway edge was not checked here, so verifying a deployed instance is an owner step.
