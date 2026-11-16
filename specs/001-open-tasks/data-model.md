# Data model: Open tasks

## entries (existing collection, two new fields)

| Field | Type | Rule |
|-------|------|------|
| `open_tasks` | number, int, min 0, not required | server-derived count of unchecked task items |
| `tasks` | json, max 32 KB | server-derived `[{ path: number[], text: string }]`, ≤ 100 items, text ≤ 200 chars |

Index: `idx_entries_open_tasks ON entries (user, open_tasks)`.

Both are overwritten on every save; values a client sends are ignored. API rules are unchanged, so owners
can read them and nobody else can. State: an item leaves `tasks` when its `checked` becomes `true`.
