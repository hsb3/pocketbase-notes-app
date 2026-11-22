# Feature Specification: R8 · Journal smart folder

**Feature Branch**: `r8-journal`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "R8 Journal smart folder ([issue 43](https://github.com/hsb3/pocketbase-notes-app/issues/43), roadmap [versions.md § R8](../versions.md#r8-journal-smart-folder)). Any note can carry an optional calendar date (writer's local calendar) and appear in a Journal smart folder across folders; day filter; clearing returns newest dates first; time zone change preserves the chosen day; removing a date removes the note only from Journal; opening Journal creates nothing; dates survive move/delete/restore; deleted notes absent from Journal; date changes from another device reach the open note and lists (live updates). Covers parent Story 4, FR-007 journal part, date parts of Story 3."

## Clarifications

### Session 2026-11-22

All answers are delegated decisions, made by the coordinator on the owner's behalf under the [R8 roadmap entry](../versions.md#r8-journal-smart-folder) and constitution III (2.0.0).

- Q: Is changing a note's journal date an edit of the note, so that it advances the saved version and moves the note up as "last edited"? → A: No. A date is metadata-only, like pin: it neither checks nor advances the saved version and leaves last-edited alone (delegated decision). A date is an absolute value that cannot overwrite words, so constitution III's metadata rule applies; treating it as an edit would give other devices false save conflicts and reorder folder lists on every re-date.
- Q: When the writer composes from Journal, which folder gets the note and does it get a date? → A: Notes, dated with the filtered day or, with no filter, today (delegated decision). An undated note would vanish from the view it was composed in; Notes matches the R7 rule for All Notes and Pinned.
- Q: Which days may a note carry? → A: Any real calendar day from 0001-01-01 to 9999-12-31, past or future (delegated decision). The old journal validator accepted the same range, and future days serve planning entries; refusing them would need a "today" the server cannot know for the writer's time zone.
- Q: When the writer searches while Journal is open, are results limited to dated notes or to the filtered day? → A: No. Search stays global, exactly as from any other view, and ignores dates (delegated decision). It keeps one search behaviour everywhere, as R7 did for Pinned; a dated-only search is not in the parent spec.
- Q: Can a note get a date before its first save? → A: Only by composing from Journal. The date action appears in the note actions once the note is saved, like Pin and Move (delegated decision). An unsaved draft has no stored note to change; compose from Journal already covers dating a new note.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Give a note a journal date and see it in Journal (Priority: P1)

A writer gives any note, in any folder, a calendar date from the note actions. The note stays in its folder and also appears in a Journal smart folder under that date. Several notes, in different folders, can share a day. The writer can change the date or remove it; removing it takes the note out of Journal only.

**Why this priority**: The date and the Journal view are the whole of FR-007's journal part. Without them nothing else in this increment has a purpose.

**Independent Test**: Give a note in Notes and a note in Garden yesterday's date. Open Journal: both appear under yesterday, each labelled with its folder, and each is still in its own folder. Remove one date: that note leaves Journal and stays in its folder.

**Acceptance Scenarios**:

1. **Given** an undated note in Garden, **When** the writer chooses a date for it from the note actions, **Then** the note stays in Garden, shows its date, and appears in Journal under that date with its folder name.
2. **Given** two notes in different folders, **When** both get the same date, **Then** Journal shows both under that one day.
3. **Given** a dated note, **When** the writer picks an earlier date (backdating), **Then** Journal shows it under the earlier day and nowhere else.
4. **Given** a dated note, **When** the writer removes its date, **Then** it disappears from Journal and stays in its folder, unchanged otherwise.
5. **Given** notes on several days, **When** the writer opens Journal, **Then** days run newest first, and notes within a day run most recently edited first.
6. **Given** no dated notes, **When** the writer opens Journal, **Then** an empty state explains how to date a note, and nothing is created.
7. **Given** a writer using only a keyboard, **When** they open the note actions, choose the date action, pick a day and confirm, **Then** the date is set and focus returns to where it was.

---

### User Story 2 - Filter Journal to one day (Priority: P2)

A writer narrows Journal to a single calendar day and clears the filter to return to every dated note.

**Why this priority**: The day filter is the second half of Story 4. It needs Story 1's dates but is independently useful once they exist.

**Independent Test**: With notes dated on three days, filter Journal to the middle day: only that day's notes show. Clear the filter: all three days show, newest first.

**Acceptance Scenarios**:

1. **Given** notes on several days, **When** the writer filters Journal by one day, **Then** only that day's notes appear.
2. **Given** a day filter with no notes, **When** it is applied, **Then** an empty state names the day and offers to clear the filter.
3. **Given** a day filter, **When** the writer clears it, **Then** every dated note appears again, newest dates first.
4. **Given** a filtered Journal, **When** the writer opens a note and goes back, or reloads the page, **Then** the same day filter is still applied.
5. **Given** the writer composes a new note from Journal, **Then** the note is filed in Notes and dated with the filtered day, or today when no day is filtered, so it appears in the Journal view the writer was looking at.

---

### User Story 3 - The date holds across time zones, devices and recovery (Priority: P3)

A journal date is a calendar day, not a moment. It reads the same after the writer travels or opens the notebook on a device set to another time zone. It survives move, delete and restore, and a date set on one device reaches every other device of the same writer.

**Why this priority**: Required for the R8 exit, but it re-asserts existing behaviour (recovery, live updates) for one more property.

**Independent Test**: Date a note 21 November on a device set to a time zone far east of UTC; open it on a device set far west of UTC: both show 21 November and both Journals list it under that day. Move, delete and restore the note: the date is still 21 November.

**Acceptance Scenarios**:

1. **Given** a note dated on one device, **When** it is viewed on a device in a different time zone, **Then** both show the same calendar day, in the note and in Journal, and the day filter for that day finds it on both.
2. **Given** "today" chosen on a device where the local day differs from the day in UTC, **Then** the stored date is the device's local day.
3. **Given** a dated note, **When** it is moved to another folder, **Then** it keeps its date and stays once in Journal.
4. **Given** a dated note, **When** it is deleted (alone, or with its folder), **Then** it disappears from Journal and every folder list immediately and appears in Recently Deleted.
5. **Given** a deleted dated note within retention, **When** restored, **Then** it returns with its date and reappears once in Journal.
6. **Given** the same note open on two devices, **When** one device sets, changes or removes its date, **Then** the other device's open note and visible lists show the change without a reload, and neither device's unsaved writing is affected.

---

### Edge Cases

- **A date is not an edit.** Setting, changing or removing a date does not change the note's "last edited" position, its writing or its folder.
- **Concurrent change.** A date change never refuses, and is never refused by, a save of the note's writing on any device. If two devices set the date at nearly the same time, the last one received wins. A date change never overwrites unsaved or newer writing.
- **Uncertain reply.** Retrying a date change after a lost reply leaves the date the writer chose; it does not flip back or apply twice.
- **Open note.** Dating the note open in the editor keeps the editor, its draft and its address; the next autosave still succeeds.
- **Opening Journal creates nothing.** Opening Journal, filtering it or clearing the filter never creates or changes a note. Composing from Journal creates a note only once the writer types, exactly like compose elsewhere.
- **Invalid days.** A day that does not exist on the calendar (for example 31 February) or a malformed value is refused, and the note keeps its previous date. A bad day in the address shows unfiltered Journal instead of an error.
- **Any day.** Past and future days are both allowed.
- **Another writer.** A second account or a guest cannot see, set or clear another writer's dates, and Journal never lists another writer's notes.
- **Search.** Search results ignore journal dates (ordering unchanged from R4). Searching from Journal searches every folder, as from any other view, and clearing the search returns to Journal with its day filter.
- **Pin.** Journal ignores pin state for ordering; a pinned dated note still shows its pin marker.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each note MUST carry an optional journal date: one calendar day, or none. A new note has none unless composed from Journal (FR-009). The date is owned and visible only to its writer.
- **FR-002**: Once a note is saved, its note actions MUST offer one date action on phone and desktop, reachable by keyboard, that sets a day, chooses today, changes the day or removes the date. The open note MUST show its date when it has one.
- **FR-003**: The system MUST provide a Journal smart folder listing each active dated note of the writer exactly once, grouped under its day, days newest first and notes within a day most recently edited first, each with its folder name, and an empty state when none exist.
- **FR-004**: Journal MUST offer a filter to one calendar day, kept in the page address so it survives Back and reload, with an empty state that names the day and offers to clear it. Clearing returns to every dated note.
- **FR-005**: A date MUST be stored and shown as the calendar day the writer chose. No device's time zone may shift it, and "today" MUST mean the writer's local day on the device that chooses it.
- **FR-006**: Setting, changing or removing a date MUST NOT change the note's last-edited time, writing or folder.
- **FR-007**: A date change MUST be independent of the note's writing: it neither requires nor changes the note's saved version, so it cannot make a save on another device fail. It sets an absolute value (last change wins) and is idempotent.
- **FR-008**: The date MUST be preserved by move, delete, folder delete and restore; deleted notes MUST never appear in Journal.
- **FR-009**: Composing from Journal MUST file the new note in Notes, dated with the filtered day or, with no filter, today. Opening, filtering or leaving Journal MUST create nothing.
- **FR-010**: A date change on one device MUST reach the writer's other devices the same way other note changes do: the open note shows the new date and visible lists, including Journal, reflect it without a reload.
- **FR-011**: The system MUST accept any real calendar day from 0001-01-01 to 9999-12-31 and refuse anything else, keeping the previous date.
- **FR-012**: The date MUST be enforced as owner-only on the server: another account or a guest can neither read nor change it.

### Key Entities

- **Note** — gains an optional journal date: a calendar day with no time and no time zone. Everything else is unchanged from R7.
- **Journal view** — a smart folder: a read-only view over the writer's active dated notes, optionally narrowed to one day. It stores nothing and never duplicates a note.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A writer dates, re-dates or undates a note in at most three actions from the note (open actions, choose the date action, confirm a day), at 390, 810 and 1440 CSS px, with zero horizontal page scrolling.
- **SC-002**: After a date change, the open note, its folder list and Journal reflect it within one second on a healthy connection on the same device, and within two seconds on a second device.
- **SC-003**: Across date, move, delete, folder delete and restore scenarios, a dated note appears in Journal exactly once when active and zero times when deleted or undated, in 100% of checked cases.
- **SC-004**: A note dated on a device in one time zone shows the same calendar day on a device in a time zone at least 24 hours apart, in 100% of checked cases.
- **SC-005**: In the concurrent-change and lost-reply scenarios, zero writer edits are overwritten, zero content saves are refused because of a date change, and zero dates are silently changed.
- **SC-006**: Opening, filtering and clearing Journal creates zero notes; a second account and a guest get zero dated notes of another writer from any list, view or direct request.

## Assumptions

- **Ordering.** Days newest first; within a day, most recently edited first. Pin does not affect Journal order. Folder lists, All Notes and Pinned keep their R7 order; a date does not change it.
- **Version check.** A date is metadata-only under constitution III (2.0.0): an absolute value that cannot overwrite words, so it does not use or advance the note's version. This mirrors R7's pin.
- **Live updates.** A date change produces the same change notice as other note changes, so the LU behaviour (open note follows, lists re-read, catch-up on focus and reconnect) covers it.
- **Placement.** Journal sits in the folder list directly below Pinned, above the real folders; Recently Deleted stays last.
- **Starting state.** No user data exists; every existing note starts undated and no backfill is needed. The old entries model's `kind` (note or journal entry) is not carried forward: any note may be dated.
- **Date control.** The old journal date picker relied on a calendar component that was removed with its dependency in R2. This increment uses the platform's own date input inside existing dialog components, keeping the old picker's Today and Clear date choices (see the plan's "Needs owner").
- **Dependencies.** R5 move, delete, restore and purge, R4 search, R7 pin and the LU live updates stay as they are.

## Parent Roadmap

**Roadmap**: [specs/002-notes-redesign/versions.md](../versions.md#r8-journal-smart-folder) → entry **R8**

**Not in this increment**: rich text, checklists and the phone formatting bar (R9); Open Tasks (R10); attachments UI (R11); wide-screen workspace controls and full-spec acceptance (R12). A date range filter, calendar month view and multiple dates per note are not planned.
