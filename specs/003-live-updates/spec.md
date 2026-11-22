# Feature Specification: Live updates on open notes and lists

**Feature Branch**: `live-updates`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "Live updates on open notes and lists ([issue 68](https://github.com/hsb3/pocketbase-notes-app/issues/68)). Subscribe the open note and the visible list to PocketBase realtime; apply a remote revision when the local draft is clean and keep the conflict dialog when both sides have unsaved edits; make the raw-SQL note actions (move, delete, restore, pin) emit realtime events; refetch on focus and on reconnect (connections capped at 30 min, missed events not replayed). Out of scope: presence, Yjs co-typing."

## Clarifications

### Session 2026-11-22

All answers are delegated decisions, made by the coordinator on the owner's behalf under the [issue 68 decision](https://github.com/hsb3/pocketbase-notes-app/issues/68).

- Q: When the open note has unsaved edits and a newer saved version arrives from another device, does the conflict show at once or only when the next save is refused? → A: At once, in R3's existing conflict state (delegated decision). The next save would be refused anyway, so waiting only delays the same dialog, and pausing autosave avoids a doomed request.
- Q: When the newer version differs only in folder or revision (a move elsewhere) and the writing is unchanged, must unsaved edits still raise a conflict? → A: No. Adopt the new folder and revision and keep the unsaved edits (delegated decision). The saved words match the draft's starting point, so nothing can be overwritten; this matches how this device already adopts its own move, and removes the false conflict issue 68 reports.
- Q: How does the writer learn that the open note was replaced with a newer version? → A: The words change in place and a screen-reader status says "Updated from another device." No toast or banner (delegated decision). It keeps the R7 announcement pattern and adds no new UI.
- Q: Where do focus and caret go when a clean open note is replaced? → A: If the editor had focus it keeps focus, with the caret at the start of the note; otherwise focus does not move (delegated decision). Keeping the exact caret across a remote rewrite needs merge logic that is out of scope.
- Q: What does the open note show when another device deletes it? → A: With no unsaved edits, the existing **Note unavailable** screen; with unsaved edits, R5's unavailable recovery with **Copy draft** (delegated decision). Both paths exist today for a delete seen on the next read.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An open note picks up writing saved on another device (Priority: P1)

A writer has a note open on a phone and edits the same note on a laptop. Once the laptop shows **Saved**, the phone shows the new words without a reload, as long as the phone has no unsaved edits. The writer can then type on the phone and it saves normally, with no conflict dialog.

**Why this priority**: This is the defect in issue 68. Today the phone keeps the old version, and the next edit there gets a false save conflict.

**Independent Test**: Open one note in two browser contexts signed in as the same writer. Type in context A until **Saved**. Context B shows the new words, then typing in B reaches **Saved** with no conflict dialog.

**Acceptance Scenarios**:

1. **Given** the same note open on devices A and B with no unsaved edits on B, **When** A saves new words, **Then** B shows those words, reports **Saved** and announces "Updated from another device." If B's editor had focus it keeps focus, with the caret at the start of the note.
2. **Given** B has just picked up A's version, **When** the writer types on B, **Then** B saves on top of A's version and reaches **Saved** with no conflict dialog.
3. **Given** B has unsaved edits, **When** A saves a newer version, **Then** B keeps every local word, stops autosaving and shows the existing conflict dialog at once, with **Copy draft**, **Cancel** and **Reload saved** as today.
4. **Given** B is saving its own edit, **When** the server confirms that save, **Then** B does not treat its own save as a change from another device.
5. **Given** B is saving and A saves at nearly the same time, **When** the server keeps one version, **Then** the other device gets the existing conflict handling and no words are lost on either device.

---

### User Story 2 - Lists stay current with changes from other devices (Priority: P2)

A writer looking at a folder list, **All Notes**, **Pinned**, search results or **Recently Deleted** sees notes that were created, edited, moved, pinned, deleted or restored on another device, without reloading.

**Why this priority**: The list is how a writer finds what changed. It also matters for move, delete, restore and pin, which today change nothing on other devices until a reload.

**Independent Test**: Show the same folder in two contexts. In A create a note, then pin it, move it out, delete it and restore it. After each step B's list matches the server.

**Acceptance Scenarios**:

1. **Given** B shows a folder list, **When** A creates or edits a note in that folder, **Then** B's list shows it in the right place with the new title and excerpt.
2. **Given** B shows a list, **When** A pins, unpins, moves, deletes or restores a note, **Then** B's lists and **Pinned** reflect the change.
3. **Given** B shows **Recently Deleted**, **When** A deletes or restores a note, or deletes a folder holding notes, **Then** B's trash list reflects it.
4. **Given** B's list is updating, **When** the new rows arrive, **Then** the rows already shown stay on screen until the update replaces them, and the page, scroll position, keyboard focus and any search text being typed stay where they were.

---

### User Story 3 - An open note follows move, delete and pin from another device (Priority: P2)

When another device moves, deletes or pins the note that is open, the open note shows the result: its new folder, its pin state, or **Note unavailable** after a delete, with any unsaved words kept for copying.

**Why this priority**: Move, delete and restore advance the note's revision. Without this, the open note on the other device gets a false conflict on its next save.

**Independent Test**: Open one note in two contexts. In A move it to Garden: B keeps the note open, shows Garden and can still save. In A pin it: B's note actions offer **Unpin**. In A delete it: B shows that the note is unavailable.

**Acceptance Scenarios**:

1. **Given** a note open on B with no unsaved edits, **When** A moves it, **Then** B keeps the note and address, adopts the new folder and saves later edits with no conflict.
2. **Given** a note open on B, **When** A pins or unpins it, **Then** B's note actions show the new pin state and B's draft and saving are unaffected.
3. **Given** a note open on B with no unsaved edits, **When** A deletes it, **Then** B shows **Note unavailable**.
4. **Given** a note open on B with unsaved edits, **When** A moves it without changing its writing, **Then** B keeps the unsaved words, adopts the new folder and saves them with no conflict.
5. **Given** a note open on B with unsaved edits, **When** A deletes it, **Then** B keeps the words and offers the existing unavailable recovery with **Copy draft**, never discarding them.

---

### User Story 4 - Catch up after sleep, network loss or a long session (Priority: P3)

Live updates can be interrupted: a phone sleeps, the network drops, or the server closes the connection after its time limit. When the writer returns to the tab or the connection comes back, the open note and the visible list catch up with anything missed.

**Why this priority**: Without catching up, missed changes would leave a device stale as it is today, only less often.

**Independent Test**: Hide or disconnect context B, change the note and list in A, then bring B back. B matches the server within the success-criteria time.

**Acceptance Scenarios**:

1. **Given** B's tab was hidden while A changed notes, **When** B becomes visible again, **Then** B's list and open note catch up.
2. **Given** B lost its live connection while A changed notes, **When** the connection is restored, **Then** B catches up even though the missed changes are never resent.
3. **Given** live updates cannot connect at all, **When** the writer uses the app, **Then** writing, saving and every existing recovery path work exactly as before.

---

### Edge Cases

- **Privacy.** Another account and a guest never receive any change signal about a writer's notes, including note IDs, over the live channel.
- **Sign-out and account switch.** After sign-out, or when a different account signs in on the same tab, the earlier account's live updates stop, and nothing from the earlier account reaches the new one.
- **Own changes.** A device's own saves and actions never show up as a change from elsewhere, and never trigger a conflict on that device.
- **Pending actions.** While a move, delete or restore from this device is waiting for its answer, or a leave or sign-out choice is open, remote changes to that note wait until it finishes. They are then checked against the result.
- **Burst of changes.** Many changes in a short time, such as a folder delete affecting dozens of notes or fast typing on another device, cause no flicker and no burst of reloads. The list settles on the final state.
- **Remote change while choosing.** If the conflict dialog is already open, a further remote save leaves the local words unchanged, and **Reload saved** loads the newest version.
- **Unavailable note.** If the open note was deleted elsewhere and then restored, the unavailable screen stays until the writer reopens the note. The list shows the restored note.
- **Expired session.** If the session expires, live updates stop with it. Re-sign-in follows today's same-account recovery.
- **Many tabs.** Two tabs on one device behave like two devices.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: While a note is open, the app MUST learn of changes to that note made by any other device or tab of the same writer, including content saves, move, delete, restore, folder delete and pin.
- **FR-002**: When a newer saved version of the open note exists and the local draft has no unsaved edits, the app MUST show the newer version and treat it as the saved baseline. The writer's next save MUST then succeed without a conflict, unless yet another device saved in between.
- **FR-003**: When a newer saved version with different writing or attachments exists and the local draft has unsaved edits, the app MUST keep every local word, stop autosaving and show the existing conflict dialog at once. It MUST never replace unsaved words automatically.
- **FR-004**: When the newer saved version differs from the draft's saved baseline only in folder or revision, the app MUST adopt that folder and revision and keep any unsaved edits, so the next save succeeds without a conflict.
- **FR-005**: When a clean open note is replaced, the app MUST announce "Updated from another device." to assistive technology and keep editor focus if it had it. When the open note is deleted elsewhere it MUST show **Note unavailable**, or R5's unavailable recovery with **Copy draft** when there are unsaved edits.
- **FR-006**: The app MUST NOT treat this device's own saves or note actions as remote changes.
- **FR-007**: Remote changes to the open note MUST NOT be applied while a save, a pin request, a note action, a leave or sign-out choice, or the conflict dialog for that note is in progress. The app MUST check again when it ends.
- **FR-008**: The visible list (folder, **All Notes**, **Pinned**, search results, **Recently Deleted**) MUST reflect notes created, edited, moved, pinned, unpinned, deleted or restored on another device.
- **FR-009**: A list update MUST keep the rows already shown until new rows arrive, and MUST preserve page, scroll position, focus and in-progress search text. A burst of changes MUST be merged so the list reloads at most four times per second, and it MUST end on the latest state.
- **FR-010**: Move, delete, restore, pin and folder delete MUST produce the same live change notice as a content save. Purge of expired notes does not need to.
- **FR-011**: Change notices MUST reach only the signed-in owner of the note. Another account and a guest MUST receive nothing, and this MUST be enforced on the server.
- **FR-012**: When the tab becomes visible again, and when the live connection is restored after a drop, the open note and the visible list MUST re-read from the server, because missed notices are not resent.
- **FR-013**: When the account changes or signs out, the app MUST stop live updates for the earlier account before showing the next account's notes.
- **FR-014**: If live updates are unavailable, every existing save, conflict and recovery behaviour MUST work unchanged. The app MUST try to reconnect when the tab next becomes visible or the network returns.
- **FR-015**: A change notice MUST NOT itself carry note content or titles. The app reads changed notes through the ordinary owner-checked reads.

### Key Entities

- **Change notice** — a short-lived message saying that one of the writer's notes changed, with its identity and its new state markers (revision, folder, deleted or not, pin). It holds no writing and is never stored.
- **Note** — unchanged. Its revision, folder, deletion state and pin are read to decide what changed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a healthy connection, within 2 seconds after one device shows **Saved** or finishes a note action, a second device with the note or list open shows the change, in at least 19 of 20 measured runs.
- **SC-002**: In the two-device scenarios (edit, move, pin, delete, restore, then type on the second device), zero false conflict dialogs appear when the second device had no unsaved edits, and zero local words are lost when it did.
- **SC-003**: Another account and a guest receive zero change notices about the writer's notes across every scenario in SC-002.
- **SC-004**: After the tab is hidden, or the connection is dropped and restored, the second device matches the server within 2 seconds of becoming visible or reconnected, in every checked case.
- **SC-005**: During a live list update, focus, scroll position and typed search text are unchanged in 100% of checked cases at 390, 810 and 1440 CSS px.

## Assumptions

- **One writer, many devices.** The scope is one account on several devices or tabs. Sharing between accounts, presence ("open on another device") and merged co-typing are out of scope, as the [issue 68 decision](https://github.com/hsb3/pocketbase-notes-app/issues/68) states.
- **Online only.** No offline queue. A device that is offline catches up when it returns (FR-012).
- **Existing save rules stay.** Constitution III stands: content saves keep the revision check, and pin stays metadata-only with no revision change. Move, delete and restore still advance the revision; this increment only makes other devices learn of them.
- **No new data.** No schema change and no stored history of changes; notices are not replayed.
- **Folders.** The folder column itself is re-read on focus and reconnect only. Live folder create and rename notices are not part of this increment.
- **Realtime transport.** The live channel is the realtime feature already built into the backend; no new service or dependency.

## Parent Roadmap

**Roadmap**: [specs/002-notes-redesign/versions.md](../002-notes-redesign/versions.md) → entry **LU**, after R7 and before R8.

**Not in this increment**: presence; merged co-typing (Yjs); an offline queue; live folder-list notices; moving move, delete and restore to metadata-only writes (separate work under constitution III).
