# Feature Specification: Open tasks from entry checklists

**Feature Branch**: `overhaul/tasks`

**Created**: 2026-11-15

**Status**: Draft

**Input**: User description: "Checklist items inside notes/journal entries are the tasks. No separate task
records, due dates, or assignees. An 'Open tasks' view in the sidebar: every unchecked item across the user's
entries, grouped by entry, newest entry first, each linking to its entry; an open-task count per entry in the
entry list; empty state. Checking an item off from the Open tasks view saves it into the entry using the
existing revision/conflict detection. The list must not download every document to find tasks; a derived
open-task count is maintained on the server so clients cannot forge it, with a backfill for existing entries."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every open task in one place (Priority: P1)

A writer adds checklist items to notes and journal entries as they go. They open "Open tasks" from the
sidebar and see every unchecked item across all their entries, grouped under the entry it belongs to, newest
entry first. Each group links to its entry.

**Why this priority**: This is the feature. Without it, open items are scattered across entries.

**Independent Test**: Create two entries with unchecked and checked items; open "Open tasks"; only the
unchecked items appear, grouped by entry, newest entry first; clicking a group opens that entry.

**Acceptance Scenarios**:

1. **Given** entries with unchecked checklist items, **When** the writer opens Open tasks, **Then** each
   unchecked item appears once under its entry's title, and entries are ordered newest first.
2. **Given** no unchecked items anywhere, **When** the writer opens Open tasks, **Then** an empty state says
   there is nothing open and how to add a checklist.
3. **Given** another account's entries with unchecked items, **When** the writer opens Open tasks, **Then**
   none of the other account's items appear.

---

### User Story 2 - Check an item off without opening the entry (Priority: P1)

From the Open tasks view the writer ticks an item. It is saved into the entry and disappears from the list.

**Why this priority**: A list you cannot act on is only half useful.

**Independent Test**: Tick an item in Open tasks; open the entry; the item is checked there.

**Acceptance Scenarios**:

1. **Given** an open item, **When** the writer ticks it, **Then** the entry is saved with that item checked
   and the item leaves the list.
2. **Given** the same entry is open with unsaved edits in another tab, **When** the writer ticks an item in
   Open tasks and later saves the other tab, **Then** the other tab's save is refused as a conflict and its
   draft is kept (nothing is silently overwritten).
3. **Given** the entry changed after the Open tasks list was loaded, **When** the writer ticks an item,
   **Then** nothing is overwritten; the writer is told the entry changed and the list refreshes.

---

### User Story 3 - Know which entries have open work (Priority: P2)

In the sidebar entry list, entries with unchecked items show how many are open.

**Independent Test**: An entry with 2 unchecked and 1 checked item shows "2 open" in the entry list.

**Acceptance Scenarios**:

1. **Given** an entry with N > 0 unchecked items, **When** the list renders, **Then** it shows the count N.
2. **Given** an entry with none, **Then** no count is shown.

### Edge Cases

- Nested checklist items count individually; a checked parent with an unchecked child still lists the child.
- An item with no text is still a task; it is shown as "(empty task)".
- Very long item text is truncated in the list; the entry keeps the full text.
- Existing entries written before this feature get correct counts without being re-saved by their owner.
- A client that sends its own count or task list has it replaced by the server's value.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Checklist items in entry bodies MUST be the only source of tasks; no separate task records.
- **FR-002**: The system MUST keep, per entry, a count of unchecked items and a small list of their text and
  position, computed by the server on every save; client-supplied values MUST be ignored.
- **FR-003**: Existing entries MUST have the count and list filled in when the feature is deployed.
- **FR-004**: The Open tasks view MUST load only entries with open items and only the fields it shows, never
  every entry body.
- **FR-005**: Ticking an item in Open tasks MUST save through the same revision check as the editor.
- **FR-006**: Users MUST see only their own entries' tasks.
- **FR-007**: The view MUST work at phone width, by keyboard alone, and in dark mode.

### Key Entities

- **Entry** (existing): gains `open_tasks` (count) and `tasks` (list of `{ path, text }` for unchecked items).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening Open tasks transfers no entry bodies.
- **SC-002**: Ticking an item takes one click (or one key press) and survives a reload.
- **SC-003**: Zero silent overwrites in the conflict test (editor draft + Open tasks tick).
- **SC-004**: Cross-account requests return no tasks from another account.

## Assumptions

- "Newest entry first" means most recently created.
- Per-entry task lists are capped (100 items, 200 characters each); the count is never capped.
- Due dates, assignees, reminders, and cross-entry task editing are out of scope.
