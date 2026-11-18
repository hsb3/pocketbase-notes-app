# Feature Specification: Personal notes across phone, tablet and desktop

**Feature Branch**: `002-notes-redesign`

**Created**: 2026-11-18

**Status**: Draft for planning following Round 1 design approval

**Input**: Follow the Apple Notes folder, note-list and writing flows. A writer can capture a thought on a phone and find it again at a desk. The minimum release proves that journey on a private account.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Capture on a phone and find the words on desktop (Priority: P1)

**Why this priority**: A single private folder, a reliable draft and a way to retrieve it deliver the minimum useful product.

**Independent test**: Start with an empty account on a phone. Create Garden, write “Seed order” followed by “Buy calendula for the south wall”, and retrieve the same note from a second browser. Repeat with an interrupted save and two competing editors.

1. **Given** an empty library, **When** the writer creates Garden and taps Compose in its note list, **Then** a single writing surface accepts the next keystroke. The first logical line becomes the title even if it wraps. Return starts the body.
2. **Given** the writer pauses after typing, **When** the latest change is acknowledged as saved, **Then** opening Garden on desktop shows one note with those exact words. Searching for “calendula” from any folder shows its title, folder and highlighted matching snippet. Opening the result and going Back restores the search.
3. **Given** a save is pending, **When** the writer keeps typing and the earlier save succeeds, **Then** newer text remains visible and pending until its own save succeeds. Navigating away attempts to save the latest draft and preserves it if that attempt fails.
4. **Given** a save fails or its acknowledgement is lost, **When** the writer edits again and chooses Retry, **Then** the latest draft is retained and the eventual result is a single note containing those latest edits. A failed request never displays Saved. If the writer tries to leave while saving still fails, the draft remains open with Retry and an explicit discard choice.
5. **Given** the session expires mid-edit, **When** the writer signs back into the same account, **Then** the latest in-session draft is available to save. Signing into another account cannot reveal or adopt that draft.
6. **Given** two devices edit the same saved version, **When** the later save encounters a stale revision (409), **Then** the newer saved version survives and the local words remain visible. Copy draft copies the current local text. Reload saved explains that it replaces local edits and proceeds only on confirmation. Cancel keeps the draft.

### User Story 2 — File and pin a note (Priority: P2)

**Why this priority**: Filing and pinning help a growing library stay navigable.

**Independent test**: Use two existing folders and two notes. Move one, pin it and unpin it.

1. **Given** a note in Notes, **When** the writer chooses Move from note actions and selects Garden, **Then** the same note stays open, belongs only to Garden and keeps its content and link. Cancel leaves it in Notes.
2. **Given** an unpinned note, **When** the writer pins it, **Then** it appears above unpinned notes in its folder and once in the global Pinned view. Moving it preserves the pin. Unpinning removes it from Pinned and restores ordinary folder ordering.

### User Story 3 — Recover a deleted note (Priority: P2)

**Why this priority**: People need a reversible way to clean up.

**Independent test**: Delete and recover a populated folder’s notes with a known deletion time.

1. **Given** a pinned, dated note with an attachment and an unchecked item, **When** it is deleted, **Then** it appears in Recently Deleted with its recovery deadline and disappears from regular folders, search, Journal, Pinned and Open Tasks.
2. **Given** a folder containing two notes, **When** the writer asks to delete it, **Then** confirmation names the folder, counts both notes and explains recovery. Cancel changes nothing. Confirm removes the folder and sends both notes to Recently Deleted together.
3. **Given** a deleted note within retention, **When** restored, **Then** its content, checklist, attachments, date and pin return in its original folder, or in Notes if that folder was removed. At the retention deadline it becomes unavailable for recovery.

### User Story 4 — Revisit reflections by date (Priority: P2)

**Why this priority**: A reflection can belong with its subject and still appear in a journal.

**Independent test**: Give two notes in different folders yesterday’s date and inspect Journal.

1. **Given** an ordinary note in Garden, **When** the writer adds or backdates its journal date, **Then** the same note stays in Garden and appears under that date in Journal. Multiple notes may share a day. Opening Journal alone creates nothing.
2. **Given** several dates, **When** the writer filters by a day, **Then** only that day’s notes appear. Clearing the filter returns newest journal dates first. Changing time zone preserves the chosen calendar day. Removing a note’s date removes it only from Journal.

### User Story 5 — Finish open checklist items across folders (Priority: P2)

**Why this priority**: A writer can act on commitments without opening every note.

**Independent test**: Start with checklist notes in two folders. Complete an item from Open Tasks and reopen its source note.

1. **Given** checked and unchecked items, **When** Open Tasks opens, **Then** unchecked items are grouped under their source notes with a link to each note. Completing an item there checks it in the source, removes it from the view and updates the note’s open-item count.
2. **Given** another writer session has changed the source note since the list loaded, **When** the item is checked, **Then** the stale action is refused, the list refreshes and neither other text nor a different item is changed. Completing the last open item reveals the empty state.

### User Story 6 — Format writing and keep files with it (Priority: P2)

**Why this priority**: A private notebook must preserve the material that gives the words meaning.

**Independent test**: On a phone, write a heading and checklist, format selected text, add a private image and PDF, then reopen the note.

1. **Given** the phone keyboard is open, **When** the writer selects text, applies formatting or adds a checklist, **Then** the formatting bar is reachable above the keyboard and the intended selection changes. Dismissing the keyboard or choosing Done returns to reading controls with the text and scroll position intact.
2. **Given** a note includes supported rich text or private files, **When** it is reopened, **Then** formatting, checklist states and inline images survive. Supported downloads retain their names. Removing an attached image also removes its inline references.
3. **Given** an upload is pending or fails, **When** the writer continues typing, **Then** the draft survives. The note cannot claim the attachment is saved until the file and its reference are available. An invalid file shows an actionable error.

### User Story 7 — Control the workspace and reach account settings (Priority: P3)

**Why this priority**: Wider screens and account controls support longer sessions after the capture loop works.

**Independent test**: Start with a selected note in a populated folder. Change window width and focus mode, then open Account using only the keyboard.

1. **Given** an 810px or 1440px window, **When** the writer shows folders, list and note together, collapses folders, enters writing focus and exits, **Then** focus mode hides both navigation columns and restores their prior visibility. Resizing mid-edit retains the selected note and draft.
2. **Given** a 390px window, **When** the writer moves from Folders to a list to a note and back, **Then** one region is shown at a time and the prior list position is restored. Search and Compose are reachable at the bottom of the list.
3. **Given** Folders is open, **When** the writer chooses Account at its foot, **Then** settings, security and sign-out are reachable. Signing out with unsaved work offers a successful save, an explicit discard, or a return to editing.

### Edge Cases

- **Private by default.** With accounts A and B, try listing, searching, opening, changing, moving, deleting and restoring A’s records as B or anonymously, including direct note and file links. No private names, snippets, contents, tasks or file bytes are disclosed. Forging ownership, folder membership or attachment references cannot transfer access.
- **Folder names.** Trim surrounding whitespace. Reject blank names, case-insensitive duplicates within one account and names reserved for built-in destinations. Explain the conflict and preserve the input. Different accounts can use the same folder name. The default Notes folder cannot be removed.
- **Empty or oversized writing.** Leaving a new whitespace-only draft with no attachments creates nothing. A supported attachment alone is valid. A blank first line uses “Untitled note”. The displayed title may be shortened to 160 characters while the original first line remains intact. If clearing a saved note would make it empty, or its document exceeds the existing 100 KB limit, explain the problem, retain the draft and leave its last valid saved version intact.
- **Empty results.** A search with zero matches retains the query, shows “No matching notes” and offers to clear it. Clearing returns to the originating folder or view. Unsupported attachment contents never produce results.
- **Interrupted actions.** A move, deletion, task completion or metadata change from a stale version may not silently replace newer edits or revive a deleted note. Keep unsaved writing available to copy when the source was deleted elsewhere.

## Requirements *(mandatory)*

### Functional Requirements

| ID | Required behavior | Acceptance reference |
|---|---|---|
| FR-001 | Each account has a private default Notes folder and can create named private folders. Each active note belongs to exactly one real folder. Scope all actions and files to the signed-in account. | Story 1, privacy and folder-name edges |
| FR-002 | Compose starts a single focused document. Derive its title from the first logical line. Save valid content automatically and make acknowledged changes available when reopened on another device. | Story 1.1–2, empty and oversized writing |
| FR-003 | Serialize saves per note within each editing session. Keep later edits pending, show save and retry states, flush on navigation and guard any action that would discard the in-session draft. Apply revision-conflict protection to every note change. | Story 1.3–6, Stories 5.2 and 7.3 |
| FR-004 | Search all active titles and body text across folders, case-insensitively. Identify each matching note once, including its folder and matched text in context. | Story 1.2, Story 3.1, empty results |
| FR-005 | Move through note actions. A single Pin action replaces favorites and controls both folder-local priority and the global Pinned view. | Story 2 |
| FR-006 | Permit recovery of deleted notes and their private attachments within the retention window, including notes from deleted folders. | Story 3 |
| FR-007 | Journal gathers every active note with a journal date across folders. Open Tasks gathers unchecked source items across active notes and permits completion in place. | Stories 4–5 |
| FR-008 | Preserve supported rich text, checklists and private attachments in the new writing surface. Apply the existing file types and limits: 10 MB per file and 20 files per note. | Story 6 and [attachment contract](../../docs/features/attachments.md) |
| FR-009 | Expose phone reading and editing states, wider collapsible columns and writing focus, with keyboard access, visible focus and readable light and dark appearances. Place Account in Folders. | Stories 6–7 and SC-005 |

### Key Entities

- **Folder** — private filing location. Notes is the permanent default. A smart folder is a view of existing notes or checklist items and never duplicates the underlying writing.
- **Note** — one private document with a stable identity, text and formatting, folder, saved revision, optional journal date, pin and deletion time. A draft is the current session’s editable copy.
- **Checklist item and attachment** — a checkable part of a note and a private file referenced by a note, respectively. Their visibility follows the note’s ownership and deletion state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** — At 390px, one Compose tap from the list places the caret. In at least 19 of 20 warm starts, a character typed within one second of the tap appears exactly once without another tap.
- **SC-002** — On a healthy connection, a typing pause starts saving within one second. With a three-second delayed acknowledgement, pending feedback remains visible and never reports newer typing as saved. A failure shows retry feedback within one second of the failure being known.
- **SC-003** — In the failed-save, lost acknowledgement, retry-after-further-typing, expiry and two-device conflict scenarios, zero latest drafts are silently lost, zero newer saved versions overwritten and zero duplicate notes created.
- **SC-004** — With 100 active notes across five folders, a unique body-only term returns the correct note and matching snippet within two seconds on a healthy connection in at least 19 of 20 searches. Another account’s notes and deleted notes yield zero matches.
- **SC-005** — At 390, 810 and 1440 CSS pixels, the capture-and-find journey completes with zero horizontal page scrolling. Using only a keyboard, a writer can create a folder, compose, search, move, restore focus after dialogs and open Account. Verify the phone bar and reading transition on a physical phone with its software keyboard open and dismissed.
- **SC-006** — The owner completes the Garden → Seed order → desktop body-search journey unaided within two minutes on a physical phone and a desktop browser, starting signed in on both devices.

## Assumptions

- **Starting state and delivery.** The app holds no user data. The approved scope requires no backward compatibility or backfill. Responsive web ships first. Future native iPhone and iPad clients should share these folder, note, search and save behaviors. Building those clients is outside this release.
- **Recovery policy (owner-confirmed).** Retain deleted notes for 30 elapsed days from deletion. Permit restore before the deadline and expire at the deadline. Deleted folders themselves are not restored. The default Notes folder receives notes whose original folder is gone.
- **Ordering and defaults (proposed).** Within each pinned or unpinned group, show the most recently edited note first. Compose in a real folder files there. Compose from All Notes files in Notes. Journal dates use the writer’s local calendar.
- **Dependencies.** Existing account authentication, security settings, supported document formats and file restrictions continue to apply. This feature revises manual saving, title-only search and flat library navigation described in the [previous design](../../docs/design/notes-journal.md). Physical-device and cross-device acceptance is still pending.
- **Outside scope.** Collaboration or sharing, handwriting, scanning or OCR, attachment-content search, offline synchronization, crash recovery beyond the in-session draft, and locked notes.
