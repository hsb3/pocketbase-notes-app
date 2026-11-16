# Research: Open tasks

- **Task source** — Decision: ProseKit `list` node, `attrs.kind === "task"`, unchecked when
  `attrs.checked !== true`. Rationale: the toolbar's Task List button already writes this shape
  (`src/components/editor/ui/toolbar/toolbar.tsx`), and `entry-validation.js` already allows it.
  Alternatives: separate `tasks` collection — rejected by the brief (no separate records).
- **Where to derive** — Decision: `onRecordValidate` in `pb/hooks/entries.pb.js`, after body validation.
  Rationale: runs for every create/update (API and superuser), so clients cannot forge it.
  Alternatives: client computes — forgeable; SQL view collection over JSON — no clean JSON tree walk in SQLite.
- **Item identity** — Decision: `path` = child-index array from the doc root. Rationale: stable for a given
  revision, which the tick already pins. Alternatives: injected ids — would need editor schema changes.
- **Backfill** — Decision: migration runs `UPDATE entries SET open_tasks, tasks` with raw SQL.
  Rationale: `app.save()` would bump `updated` and reorder every list. Duplicates the small walker
  because migrations cannot rely on hook-loading order.
- **Ordering** — Decision: newest *created* first. Alternatives: `-updated` (moves whenever edited).
- **Checkbox** — Decision: native `<input type="checkbox">` with `accent-primary`. Rationale: accessible,
  dark-mode aware, no new UI file outside the lane.
