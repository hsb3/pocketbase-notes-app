# Open tasks

## What it is

- **Checklist items are the tasks.** Use the Task List button in the editor toolbar in any note or journal
  entry. Every unchecked item is an open task.
- **Open tasks view** (`/entries/tasks`, the checklist icon in the left rail): every unchecked item across
  your entries, grouped by entry, newest entry first. Each group links to its entry.
- **Tick from the list.** Checking an item saves it into the entry through the normal revision check. If the
  entry changed since the list loaded, nothing is overwritten: the list says so and refreshes. An editor tab
  with unsaved changes to the same entry gets the usual "A newer version was saved" conflict on its next save,
  with its draft kept.
- **Counts in the entry list.** Entries with open items show "N open".

## How it works

- `pb/hooks/entries.pb.js` derives two fields on every entry save (create or update, any client):
  `open_tasks` (exact count) and `tasks` (`[{ path, text }]`, at most 100 items, 200 characters each).
  Values a client sends are replaced, so they cannot be forged. The walker is `tasks()` in
  `pb/hooks/entry-validation.js`.
- The view requests only `open_tasks > 0` entries and only index fields; it never downloads entry bodies.
  Ticking an item fetches that one entry, sets `checked` on the node at `path`, and saves with the revision
  the list showed.
- `pb/migrations/1794796300_backfill_entry_tasks.js` fills the fields for entries saved before this
  feature, with SQL, so `updated` and `revision` do not change.
- Ownership: the existing entry rules apply; other accounts see no tasks.

## What it deliberately is not

- No separate task records, due dates, reminders, assignees, priorities or sharing.
- No un-ticking or editing task text from the list: open the entry for that.
- No real-time updates: the list refreshes on load and after each tick.
- Items beyond the first 100 in one entry are counted but not listed; the entry says to open it.

## Tests

`scripts/test-entries.ts` (API: derivation, forging, isolation) and `tests/e2e/tasks.spec.cjs`
(browser: desktop and mobile, keyboard, conflicts, dark mode). See
[test setup and reports](../testing/verification.md).
