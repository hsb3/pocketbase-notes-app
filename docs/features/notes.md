# Private folders and notes

Sign-in opens **All Notes** at `/folders/all`. Choose **Compose** to put the caret in a new note. Type a title, press Return and write the body. Wrapping a line on screen leaves its title intact. After a half-second pause the editor saves automatically. Wait for **Saved** before closing the browser or opening the note on another device.

## Folders, list and Compose

In Folders, **New folder** creates and opens a private folder. A rejected name stays in the dialog for correction. Compose in a folder files the note there. Compose in All Notes uses the permanent **Notes** folder. Back from an empty or whitespace-only new draft creates no record.

All Notes lists active notes across folders. A folder list shows only its own. Lists are paged by most recent edit. Each row needs only the ID, folder, title, update time and a short excerpt from below the first line. A single-line note has no excerpt. Selecting a row loads its document at `/notes/<id>`. Missing and inaccessible notes show the same unavailable screen.

At phone width the list has Compose at bottom right. Back from a note restores the page, scroll and row focus. When a note was opened by direct link, Back goes to its actual folder. From 768 CSS pixels the folders, list and editor share one workspace. Resizing preserves the draft and caret. Account and theme controls are at the foot of Folders.

The editor shows **Pending** when typing, **Saving** while it sends the current edit and **Saved** once the server confirms the latest words. Typing can continue throughout. Writes run one at a time per note.

## Folders and ownership

Creating an ordinary account also creates its permanent **Notes** folder in the same transaction. If the folder cannot be saved, account creation fails. The records API allows an account to create custom folders and delete its empty ones. The API prevents renaming folders, changing ownership, deleting the default folder and deleting a folder that contains notes. Deleting the account removes its folders and notes.

Custom folder names keep their display spelling after trimming and allow 1–80 Unicode code points. Within one account, names must have a unique comparison key. The server normalizes the name to NFC, uppercases it without a locale, then normalizes to NFC again. For example, `Café`, `CAFÉ` and a decomposed spelling share a key. Unaccented `Cafe` has its own key. The reserved names are Notes, All Notes, Pinned, Journal, Open Tasks and Recently Deleted.

## Saving a document

Create a note with the authenticated user's ID in `user`, an owned `folder`, a rich-text `body` and any ordered `attachments`. The encoded document limit is 102400 bytes. Whitespace alone is rejected. An owned attachment can make an otherwise empty document valid. Up to 20 files can be attached, and every embedded private image must appear in that list. A saved note reference protects the file from direct deletion and hourly orphan cleanup.

Ordinary accounts can list and read only their own notes. The account and folder on a saved note are fixed. The server keeps `deleted` empty and rejects an ordinary request to delete the note permanently. On each save it derives the following fields from the full document.

| Field | Stored value |
| --- | --- |
| `title` | First logical line, capped at 160 Unicode code points. A blank first line yields **Untitled note**, even when later lines have text. |
| `text` | Full original visible text, including mention labels. Adjacent styled runs join without spaces. Hard breaks and block boundaries separate lines. |
| `search_key` | Searchable text transformed with the folder comparison rule, including the fallback title when used. Owners can filter on it. PocketBase omits this internal field from returned notes, including expanded records and realtime events. |
| `open_tasks`, `tasks` | Exact unchecked count, plus the first 100 unchecked items in document order. Each item has a child-index path and a label of up to 200 characters. |

On list reads the server also returns a computed `excerpt`. It skips the title line, collapses whitespace and caps the result at 120 Unicode code points.

New notes start at revision 1. Send the current numeric `revision` with each update. PocketBase checks it and saves the next revision in a single write transaction. If two edits use the same revision, one succeeds and the other receives HTTP 409. A missing or stale revision also returns 409 and preserves the stored document.

## Recovering an uncertain save in R3

**Keep the tab open.** If a save fails, the words stay editable. Choose **Retry** to save the latest words.

- **Invalid note.** A saved note needs writing or an attachment. If the document exceeds 100 KB (102400 UTF-8 bytes including its JSON structure), shorten it. Correct the draft and choose **Retry**. The last valid server version stays available.
- **Session expired.** Sign in again in the same tab with the original account. Its draft reopens at the same note address. Choose **Retry** to check and save it. The sign-in screen hides the private editor. A different account sees its own library while the original draft stays in tab memory.
- **Save conflict.** Choose **Copy draft** to keep a plain-text copy of the current local words. If the clipboard is blocked, select and copy them in the editor. **Cancel** keeps both versions and **Review conflict** reopens the dialog. To give up the local edits, choose **Reload saved**, then confirm **Reload saved** in **Replace this draft?**. Confirmation reads the current server version again. If the read fails, the local words remain available. If the note is unavailable, use **Copy draft** to keep them.

If the reply was lost, Retry reads the record as its owner. A match on ID, owner, folder, ordered attachments, full body and expected revision confirms the submitted edit. Later typing saves against that revision.

A create keeps its original ID of 15 lowercase ASCII letters or digits. After an uncertain create, a verified owner read that finds no record permits a retry with the same ID. A duplicate ID returns HTTP 400 (`validation_not_unique`) and preserves the first record. If that record is unreadable, recovery stops and the words remain available to copy.

## Leaving a draft

Back, navigation links and Compose wait for pending edits to save. If the save fails, or if **Log out** is chosen with unsaved edits, a dialog offers three choices. **Keep editing** returns focus to the draft. **Save and continue** tries to save the latest words and leaves after confirmation. For a conflict or unavailable note, return to the editor to review or copy the draft. **Discard** abandons local edits and preserves any version already committed. While the sign-out choice is open, queued edits wait.

On a reload, tab close or full-page navigation with unsaved writing, the browser can offer its native leave warning, including during sign-in. Choose **Stay** to return to the draft. Leaving ends its in-memory recovery. A mobile browser or operating system can close a tab without showing a warning. Wait for **Saved** or copy the draft before closing it.

## Later increments and source recovery

The [redesign roadmap](../../specs/002-notes-redesign/versions.md) places search in R4, pinning in R7, Journal in R8, formatting controls in R9, Open Tasks in R10 and attachment controls in R11. Pasted rich content and existing private image references can already survive a body edit.

The R2 migration drops the legacy `entries` collection and preserves R1 notes and folders. [Rollback](../../deploy/OPERATIONS.md#rollback) requires a matching app and pre-upgrade backup to recover old entries. To inspect the retired editor source without changing the checkout, run:

```sh
git show b94195fa47eb0585d120e477911c6c333509faa4:src/features/entries/entry-editor.tsx
```
