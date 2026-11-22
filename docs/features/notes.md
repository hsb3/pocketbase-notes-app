# Notes

Choose **Compose** in a note list and start typing. The first logical line becomes the title. Press Return to start the body. A line that wraps on screen still counts as one line. A blank first line with writing below it gives the note the title **Untitled note**.

After a half-second pause the editor starts an autosave. **Pending** means the latest words are waiting to save, **Saving** means a write is in progress, and **Saved** means the server has confirmed the latest edits. Writes run one at a time per note, so typing can continue during a save. Wait for **Saved** before closing the tab or looking for the note on another device.

## Opening and leaving notes

The notebook opens at **All Notes** (`/folders/all`) by default. Choose a [folder](folders.md) to narrow the list. Notes are paged by most recent edit, with [pinned notes](#pin-a-note) first. Each row shows the title and, when present, a short excerpt from below the first line. Open a row to read the full document at `/notes/<id>`. Missing notes and another account’s notes show the same **Note unavailable** screen.

On a phone, **Compose** is at the foot of the list. **Back** from an opened row restores the list page, scroll position and row focus. Back from a direct note link opens its folder. From 768 CSS pixels the folders, list and editor share one workspace. Resizing preserves the draft and caret. Leaving a new draft containing only whitespace creates no record.

## Search across folders

From any folder or **All Notes**, enter part of a title or body in **Search** and press Enter or select the search button. Search covers every active note in the signed-in account, including text beyond the list excerpt. It omits deleted notes and attachment contents. On a phone the field sits beside Compose at the foot of the list. On wider screens it sits above the results.

Use a single line of up to 160 Unicode code points. Matching ignores case, treats punctuation such as `%` and `_` literally, and preserves accents. For example, `CAFÉ` finds `café`, including an equivalent decomposed spelling. Each result shows the title, its actual folder and a short preview highlighting the original matching text. If a base character carries more than 30 consecutive combining marks, text beyond the 30th mark may fail to match or highlight. A hit with no corresponding highlight shows the beginning of the note as plain text.

Open a result and use Back to restore the query, result page, scroll position and row focus. If an edit moves the row off that page, focus returns to Search. **Clear** or Escape in the field restores the originating folder and its list page. On a wide screen, changing the search, paging or clearing beside an open draft uses the same [save choices](#leaving-a-draft) as Back. **No matching notes** keeps the query available to edit or clear. A failed read offers **Retry**.

## Pin a note

On a saved note, open **Note actions** and choose **Pin**. The note moves to the top of its folder and of **All Notes**, marked with a pin. Pinned notes form a group above the rest. Within each group the most recently edited note comes first. Choose **Unpin** to return the note to its place by last edit. **Pinned** in the folder list shows every pinned note, with its folder.

A pin is not an edit. It keeps the note's last-edit time, writing, folder and revision, so it never causes a save conflict on another device. Two devices that pin and unpin at nearly the same time end with the last change the server received. If the reply is lost, **Retry** sends the same choice again. Search ignores pins. Moving, deleting and restoring a note keep its pin, and a deleted note never shows in **Pinned**.

At the API, `POST /api/notebook/notes/<id>/pin` takes exactly `{ "pinned": true }` or `{ "pinned": false }`. It returns `id`, `user`, `folder`, `deleted`, `revision` and `pinned`. Setting the value the note already has succeeds without a write. A deleted note returns HTTP 400. The ordinary records API cannot create a note with `pinned` or change it.

## Live updates

A note open on one device follows saves, moves, pins and deletes made on another device or tab signed in to the same account, usually within two seconds and without a reload.

- **No unsaved edits.** The newer words replace the editor's contents, the status shows **Saved**, and screen readers hear "Updated from another device." If the editor had focus it keeps it, with the caret at the start of the note. Typing then saves on top of the newer version without a conflict.
- **Unsaved edits and different words saved elsewhere.** Autosave stops and the [save conflict](#recovering-an-uncertain-save-in-r3) dialog opens at once. Every local word stays in the editor and in **Copy draft**. Further saves elsewhere change nothing on screen until **Reload saved**, which loads the newest version.
- **A move elsewhere.** The note keeps its address and shows its new folder. Unsaved edits are kept and save into the new folder, because the saved words they started from did not change. A save that was in flight when the move happened is sent again on the new revision.
- **A pin elsewhere.** **Note actions** offers **Unpin** or **Pin** to match. Writing and saving are unaffected.
- **A delete elsewhere.** With no unsaved edits the editor shows **Note unavailable**. With unsaved edits it offers **Copy draft**. A later restore elsewhere returns the note to the lists, while the open view stays unavailable until the note is opened again.

While a save, a pin, a move or delete, a leave or sign-out choice, or the conflict dialog is in progress, a change from elsewhere waits until it ends and is then checked against the result. This device's own saves and actions are never treated as changes from elsewhere.

Missed changes are never resent. Returning to the tab, coming back online and every reconnect read the open note, the visible list and the folders again. The server closes each live connection after at most 30 minutes, and the app reconnects. Saving never depends on the live connection: if it cannot connect, saving, conflicts and every recovery path work as before, and the app tries again when the tab is next shown or the network returns. Signing out or switching accounts stops live updates before the next account's notes appear.

At the API, subscribe to the PocketBase realtime topic `notebook-changes` with the signed-in user's token (`pb.realtime.subscribe("notebook-changes", …)`, no options). Each event carries exactly `id`, `folder`, `deleted` (boolean), `revision` and, for creates, content saves and pins, `pinned`. It carries no title, writing or other content: read the note through the ordinary records API. Events are sent after every committed create, content save, move, delete, restore, pin and folder delete (one per affected note), only to clients bound to the note's owner. Refused writes, other accounts, guests and superusers receive nothing. Purge sends nothing. [Contract](../../specs/003-live-updates/contracts/notice.md)

## Move, delete and restore

See the [folder guide](folders.md#move-delete-and-restore) to move a saved note, delete a note or folder, or restore writing from Recently Deleted.

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

## Saving a document

Create a note with the authenticated user's ID in `user`, an owned `folder`, a rich-text `body` and any ordered `attachments`. The encoded document limit is 102400 bytes. Whitespace alone is rejected. An owned attachment can make an otherwise empty document valid. Up to 20 files can be attached, and every embedded private image must appear in that list. Body-only edits preserve ordered attachments, including [protected images](attachments.md). A saved note reference protects the file from direct deletion and hourly orphan cleanup.

Ordinary accounts list only their own active notes. The records API can still return a valid deleted note to its writer by known ID until purge. Opening it in the editor shows **Note unavailable**. A content PATCH cannot reassign the note, move it or set its deletion time. The dedicated move, delete and restore commands check the current revision in a transaction. A stale command returns HTTP 409 without changing the note. On each content save the server derives the following fields from the full document.

| Field | Stored value |
| --- | --- |
| `title` | First logical line, capped at 160 Unicode code points. A blank first line yields **Untitled note**, even when later lines have text. |
| `text` | Full original visible text, including mention labels. Adjacent styled runs join without spaces. Hard breaks and block boundaries separate lines. |
| `search_key` | Visible text and the displayed title, folded with the folder comparison rule. The server includes the fallback title when needed, prefixes a separately folded title if it would otherwise be missed, and replaces NUL with a line break in the key. The signed-in account can filter on this field. PocketBase omits it from returned notes, including expanded records and realtime events. |
| `open_tasks`, `tasks` | Exact unchecked count, plus the first 100 unchecked items in document order. Each item has a child-index path and a label of up to 200 characters. |

On list reads the server also returns a computed `excerpt`. It skips the title line, collapses whitespace and caps the result at 120 Unicode code points.

New notes start at revision 1. Send the current numeric `revision` with each update. PocketBase checks it and saves the next revision in a single write transaction. If two edits use the same revision, one succeeds and the other receives HTTP 409. A missing or stale revision also returns 409 and preserves the stored document.

## Later increments and source recovery

The [Milestone 1 gate](../../specs/002-notes-redesign/r6-gate/spec.md) checks capture, search and recovery across phone and desktop. The owner revisits the roadmap after Milestone 1.

The R2 migration drops the legacy `entries` collection and preserves R1 notes and folders. [Rollback](../../deploy/OPERATIONS.md#rollback) requires a matching app and pre-upgrade backup to recover old entries. To inspect the retired editor source without changing the checkout, run:

```sh
git show b94195fa47eb0585d120e477911c6c333509faa4:src/features/entries/entry-editor.tsx
```
