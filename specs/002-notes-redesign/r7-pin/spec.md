# Feature Specification: R7 · Pin

**Feature Branch**: `r7-pin`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "R7 Pin" (roadmap increment R7 of the notes redesign, [issue 42](https://github.com/hsb3/pocketbase-notes-app/issues/42)), chosen after `/speckit-specify workflow run functionform` arrived without a feature description.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pin a note to the top of its folder (Priority: P1)

A writer marks an important note with one Pin action. In its folder, and in All Notes, pinned notes sit in a group above unpinned ones. Unpin returns it to ordinary ordering.

**Why this priority**: Folder-local priority is the core of Pin and is useful on its own, without the Pinned view.

**Independent Test**: In a folder with three notes, pin the oldest. It moves to the top of the folder list. Unpin it; it returns to its recency position.

**Acceptance Scenarios**:

1. **Given** a folder with unpinned notes A (newest), B and C (oldest), **When** the writer pins C from the note actions, **Then** C shows first, marked as pinned, followed by A then B.
2. **Given** pinned notes C and D in the same folder, **When** the writer edits D, **Then** D shows above C within the pinned group, and both stay above every unpinned note.
3. **Given** a pinned note, **When** the writer unpins it, **Then** it shows in the unpinned group at the position its last edit gives it.
4. **Given** the writer pins or unpins a note, **When** the list reloads on another device, **Then** the same pin state and order show there.
5. **Given** a writer using only a keyboard, **When** they open the note actions and choose Pin or Unpin, **Then** the action works and focus returns to where it was.

---

### User Story 2 - See every pinned note in one Pinned view (Priority: P2)

A Pinned smart folder lists every active pinned note across all folders, each once, with the folder it lives in.

**Why this priority**: The global view is the second half of FR-005, but depends on Story 1's pin state.

**Independent Test**: Pin one note in Notes and one in Garden. Open Pinned: both appear once, each labelled with its folder. Open one and edit it; it stays in Pinned.

**Acceptance Scenarios**:

1. **Given** pinned notes in two folders, **When** the writer opens Pinned, **Then** each appears exactly once, most recently edited first, with its folder name.
2. **Given** no pinned notes, **When** the writer opens Pinned, **Then** an empty state explains how to pin a note.
3. **Given** the writer is in Pinned, **When** they unpin a note there, **Then** it leaves the Pinned list and stays in its folder.
4. **Given** the writer composes a new note while Pinned is open, **Then** the note is filed in Notes, unpinned (same rule as composing from All Notes).

---

### User Story 3 - Pin survives move, delete and restore (Priority: P3)

A pinned note keeps its pin through every R5 action, and a deleted note never shows in Pinned.

**Why this priority**: Required for the R7 exit, but it only re-asserts R5 paths for one more property.

**Independent Test**: Pin a note, move it, delete it, check Pinned, restore it, check Pinned again.

**Acceptance Scenarios**:

1. **Given** a pinned note in Notes, **When** the writer moves it to Garden, **Then** it is still pinned, at the top of Garden, and still once in Pinned.
2. **Given** a pinned note, **When** it is deleted (alone, or with its folder), **Then** it disappears from Pinned and every folder list immediately and appears in Recently Deleted.
3. **Given** a deleted pinned note within retention, **When** restored, **Then** it returns pinned, to its original folder or to Notes if that folder was removed, and reappears once in Pinned.

---

### Edge Cases

- **Pin is not an edit.** Pinning or unpinning does not change the note's "last edited" position; otherwise pinning would reorder the unpinned group on unpin.
- **Concurrent change.** A pin never refuses, and is never refused by, a save of the note's writing on any device. If two devices set the pin at nearly the same time, the last one received wins. A pin never overwrites or discards unsaved or newer writing.
- **Uncertain reply.** Retrying a pin after a lost reply leaves the note pinned once; it does not toggle back.
- **Open note.** Pinning the note open in the editor keeps the editor, its draft and its URL; the next autosave still succeeds.
- **Another writer.** A second account or a guest cannot see, set or clear another writer's pin, and Pinned never lists another writer's notes.
- **Many pins.** If every note in a folder is pinned, the folder shows one group in recency order.
- **Search.** Search results ignore pin state (ordering unchanged from R4).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each note MUST carry a pin state, unpinned by default, owned and visible only to its writer.
- **FR-002**: The note actions MUST offer one Pin / Unpin action on phone and desktop, reachable by keyboard.
- **FR-003**: Every folder list and All Notes MUST show pinned notes as a group above unpinned notes, each group most recently edited first, with a visible pinned marker.
- **FR-004**: The system MUST provide a Pinned smart folder listing each active pinned note of the writer exactly once, with its folder name, most recently edited first, and an empty state when none exist.
- **FR-005**: Pinning or unpinning MUST NOT change the note's last-edited time, content or folder.
- **FR-006**: A pin change MUST be independent of the note's writing: it neither requires nor changes the note's saved version, so it cannot make a save on another device fail. It sets an absolute value (last change wins) and is idempotent: setting the state the note already has succeeds without change.
- **FR-007**: Pin state MUST be preserved by move, delete and restore; deleted notes MUST never appear in Pinned.
- **FR-008**: Composing from Pinned MUST file the new note in Notes, unpinned.
- **FR-009**: The pin state MUST be enforced as owner-only on the server: another account or a guest can neither read nor change it.

### Key Entities

- **Note** — gains a pin state (pinned or not). Everything else is unchanged from R5.
- **Pinned view** — a smart folder: a read-only view over the writer's active pinned notes. It stores nothing and never duplicates a note.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A writer pins or unpins a note in at most two actions from the note (open actions, choose Pin), at 390, 810 and 1440 CSS px, with zero horizontal page scrolling.
- **SC-002**: After a pin or unpin, the folder list and Pinned reflect the new state within one second on a healthy connection.
- **SC-003**: Across pin, move, delete, folder delete and restore scenarios, a pinned note appears in Pinned exactly once when active and zero times when deleted, in 100% of checked cases.
- **SC-004**: In the concurrent-change and lost-reply scenarios, zero writer edits are overwritten, zero content saves are refused because of a pin, and zero pin states are silently flipped.
- **SC-005**: A second account and a guest get zero pinned notes of another writer from any list, view or direct request.

## Assumptions

- **Ordering.** Within each pinned and unpinned group, most recently edited first; this is the parent spec's proposed ordering, adopted here. Pin time does not affect order.
- **Version check.** Pin is metadata-only under constitution III (2.0.0, amended 2026-11-21): it does not use or advance the note's version. Move, delete and restore keep their R5 behaviour in this increment.
- **Starting state.** No user data exists; every existing note starts unpinned and no backfill is needed. The former `favorite` concept from the old entries model is not carried forward.
- **Placement.** Pinned sits in the folder list directly below All Notes, above the real folders; Recently Deleted stays last.
- **R6 gate.** The owner signed off R6 (merged in #69), so R7 may start.
- **Dependencies.** R5 move, delete, restore and purge behaviour, and the R4 search, stay as they are.

## Parent Roadmap

**Roadmap**: [specs/002-notes-redesign/versions.md](../versions.md#r7-pin) → entry **R7**

**Not in this increment**: Journal dates (R8); rich text, checklists and the phone formatting bar (R9); Open Tasks (R10); attachments UI (R11); wide-screen workspace controls and full-spec acceptance (R12). Manual reordering of pinned notes and pinning folders are not planned.
