# Contract: Open tasks

## List (client → PocketBase records API)

`GET /api/collections/entries/records?filter=open_tasks>0&sort=-created,-id&fields=id,title,kind,journal_date,created,revision,open_tasks,tasks`

Returns only the owner's entries (existing list rule). No `body` in the response.

## Tick one item

1. `GET /api/collections/entries/records/:id` (one body).
2. Client sets `checked: true` on the `list` node at `path`.
3. `PATCH /api/collections/entries/records/:id` with `{ body, revision: <revision from the list> }`.
   - `200`: saved; server recomputes `open_tasks`/`tasks`, bumps `revision`.
   - `409`: entry changed since the list loaded; client reports it and refreshes.
