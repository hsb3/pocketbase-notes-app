# Private folders and notes

Sign-in opens **All Notes** at `/folders/all`. Choose **Compose** to put the caret in a new note. Type a title, press Return and write the body. Wrapping a line on screen leaves its title intact. After a half-second pause the editor saves automatically. Wait for **Saved** before closing the browser or opening the note on another device.

## Folders, list and Compose

In Folders, **New folder** creates and opens a private folder. A rejected name stays in the dialog for correction. Compose in a folder files the note there. Compose in All Notes uses the permanent **Notes** folder. Back from an empty or whitespace-only new draft creates no record.

All Notes lists active notes across folders. A folder list shows only its own. Lists are paged by most recent edit. Each row needs only the ID, folder, title, update time and a short excerpt from below the first line. A single-line note has no excerpt. Selecting a row loads its document at `/notes/<id>`. Missing and inaccessible notes show the same unavailable screen.

At phone width the list has Compose at bottom right. Back from a note restores the page, scroll and row focus. When a note was opened by direct link, Back goes to its actual folder. From 768 CSS pixels the folders, list and editor share one workspace. Resizing preserves the draft and caret. Account and theme controls are at the foot of Folders.

Autosave sends one write at a time per note. If typing continues during a save, the editor sends the newer words with the acknowledged revision. In-app navigation waits for pending edits to finish. On failure it keeps the words and error visible. Unacknowledged edits live only in browser memory.

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

The API accepts a client-selected ID of exactly 15 lowercase ASCII letters or digits. Creating the same ID again returns HTTP 400 (`validation_not_unique`) and preserves the first record. The planned R3 client uses this contract when a save response is lost.

1. Keep the submitted snapshot, stable ID and expected resulting revision separate from edits made while the request was in flight.
2. Fetch the ID as the same owner. Compare the ID, owner, folder, ordered attachments, full body and resulting revision. An exact match acknowledges the submitted snapshot. Send queued edits against the confirmed revision.
3. If the owned record differs, preserve the draft for conflict handling. If an ambiguous create has no visible record, retry with the same ID. A confirmed collision with no matching readable record requires an explicit failure. Neither HTTP 400 nor 409 alone acknowledges a save.

## Later increments and source recovery

The [redesign roadmap](../../specs/002-notes-redesign/versions.md) places search in R4, pinning in R7, Journal in R8, formatting controls in R9, Open Tasks in R10 and attachment controls in R11. Pasted rich content and existing private image references can already survive a body edit.

The R2 migration drops the legacy `entries` collection and preserves R1 notes and folders. [Rollback](../../deploy/OPERATIONS.md#rollback) requires a matching app and pre-upgrade backup to recover old entries. To inspect the retired editor source without changing the checkout, run:

```sh
git show b94195fa47eb0585d120e477911c6c333509faa4:src/features/entries/entry-editor.tsx
```
