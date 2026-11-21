# Notes

Choose **Compose** in a note list and start typing. The first logical line becomes the title. Press Return to start the body. A line that wraps on screen still counts as one line. A blank first line with writing below it gives the note the title **Untitled note**.

After a half-second pause the editor starts an autosave. **Pending** means the latest words are waiting to save, **Saving** means a write is in progress, and **Saved** means the server has confirmed the latest edits. Writes run one at a time per note, so typing can continue during a save. Wait for **Saved** before closing the tab or looking for the note on another device.

## Opening and leaving notes

The notebook opens at **All Notes** (`/folders/all`) by default. Choose a [folder](folders.md) to narrow the list. Notes are paged by most recent edit. Each row shows the title and, when present, a short excerpt from below the first line. Open a row to read the full document at `/notes/<id>`. Missing notes and another account’s notes show the same **Note unavailable** screen.

On a phone, **Compose** is at the foot of the list. **Back** from an opened row restores the list page, scroll position and row focus. Back from a direct note link opens its folder. From 768 CSS pixels the folders, list and editor share one workspace. Resizing preserves the draft and caret. Leaving a new draft containing only whitespace creates no record.

## Search across folders

From any folder or **All Notes**, enter part of a title or body in **Search** and press Enter or select the search button. Search covers every active note in the signed-in account, including text beyond the list excerpt. It omits deleted notes and attachment contents. On a phone the field sits beside Compose at the foot of the list. On wider screens it sits above the results.

Use a single line of up to 160 Unicode code points. Matching ignores case, treats punctuation such as `%` and `_` literally, and preserves accents. For example, `CAFÉ` finds `café`, including an equivalent decomposed spelling. Each result shows the title, its actual folder and a short preview highlighting the original matching text. If a base character carries more than 30 consecutive combining marks, text beyond the 30th mark may fail to match or highlight. A hit with no corresponding highlight shows the beginning of the note as plain text.

Open a result and use Back to restore the query, result page, scroll position and row focus. If an edit moves the row off that page, focus returns to Search. **Clear** or Escape in the field restores the originating folder and its list page. On a wide screen, changing the search, paging or clearing beside an open draft uses the same [save choices](#leaving-a-draft) as Back. **No matching notes** keeps the query available to edit or clear. A failed read offers **Retry**.

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
