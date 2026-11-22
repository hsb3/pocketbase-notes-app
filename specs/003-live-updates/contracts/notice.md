# Contract: notebook change notices

## Subscribe

Uses PocketBase's realtime endpoints unchanged.

1. `GET /api/realtime` opens an SSE stream. The first event is `PB_CONNECT` with `{"clientId":"<40 chars>"}`.
2. `POST /api/realtime` with `Authorization: <user token>` and `{"clientId": "...", "subscriptions": ["notebook-changes"]}` returns 204.

The SDK does both: `pb.realtime.subscribe("notebook-changes", callback)`. Subscribe with no options: the server matches the exact key `notebook-changes`, so a key with `?options=` receives nothing.

## Event

SSE event name `notebook-changes`; `data` is one JSON object:

```json
{ "id": "a1b2c3d4e5f6g7h", "folder": "f1f2f3f4f5f6f7f", "deleted": false, "revision": 4, "pinned": true }
```

- Keys are exactly `id`, `folder`, `deleted`, `revision`, and `pinned` when the write path knows it ([data model](../data-model.md#change-notice-never-stored)).
- No `user`, `title`, `text`, `body`, `excerpt`, `search_key`, `tasks` or attachment data, ever.
- Sent only after the write committed. Never sent for a refused or rolled-back write.
- At most once, in commit order per connection. Not replayed after a disconnect.

## Who receives it

| Subscriber | Receives notices for the owner's notes |
|---|---|
| The owner, any number of tabs or devices | Yes, including the tab that made the change |
| Another account | No |
| Guest (subscribed without a token) | No |
| Superuser | No |

A subscribe POST on the same client with a different account's token is refused by PocketBase with 403.

## Client handling

The client treats a notice as a hint, never as data:

- Drop it unless the session is current and the payload matches the shape above (an unknown or malformed payload is ignored).
- Read changed notes only through the existing owner-checked reads (`getNote`, `listNotes`, `searchNotes`, the Recently Deleted route).
- Never write because of a notice.
