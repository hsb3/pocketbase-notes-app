# Folders

**All Notes** shows active notes from every folder in the signed-in account. **Notes** is the permanent folder where Compose files a note started from All Notes. **Pinned** shows every pinned note, most recently edited first, with the folder each one lives in. Compose from All Notes or Pinned files the new note, unpinned, in Notes. To file new writing elsewhere, open that folder before choosing **Compose**. [Writing and searching notes](notes.md)

## Create a folder

On a phone, choose **Folders** from the note list. On wider screens, use the folders pane. Choose **New folder**, enter a name and select **Create folder**. The new folder opens. If the name is rejected, it stays in the dialog for correction.

Custom folder names keep their display spelling after trimming and allow 1–80 Unicode code points. Within one account, names must have a unique comparison key. The server normalizes the name to NFC, uppercases it without a locale, then normalizes to NFC again. For example, `Café`, `CAFÉ` and a decomposed spelling share a key. Unaccented `Cafe` has its own key. The reserved names are Notes, All Notes, Pinned, Journal, Open Tasks and Recently Deleted.

## Move, delete and restore

### Move a note

On a saved note, open **Note actions** and choose **Move…**. Select another folder to move the note, or **Cancel** to keep it in place. The editor saves pending writing first. A move keeps the same note address, document, attachments and last-edit time. The note leaves its old folder list, and matching search results show its new folder.

### Restore a deleted note

Choose **Delete note…** to review the title and confirm. The note disappears from ordinary lists and search. To bring it back, open **Folders → Recently Deleted** and choose **Restore** beside its title. Each row shows the deadline in local time with the time zone. Restore works strictly before 30 elapsed days from deletion. It returns the same note and attachments to the original folder if it survives, or to **Notes** if it was removed. The note can be found in search again.

### Delete a folder

To remove a custom folder, open its list and choose **Delete folder**. Check the folder name and active note count. **Cancel** keeps the folder and its contents. Confirming removes the folder permanently and sends its active notes to Recently Deleted together. Notes already there keep their original deadlines. If any member changed since the preview, review the fresh preview and confirm again, even if the count looks the same.

### Check an interrupted action

If a reply is lost during a move, deletion or restore, choose **Check again**. It reads the current state before another action can be submitted. **Close** dismisses the prompt and leaves the check available, even if the row or folder has disappeared. If the read fails, **Retry** checks again. Keep the tab open if there are unsaved words. When another change makes the note unavailable, **Copy draft** preserves the latest local text. If clipboard access fails, select and copy the words in the editor.

## Folder ownership

Creating an ordinary account also creates its permanent **Notes** folder in the same transaction. If the folder cannot be saved, account creation fails. Its name and ownership are fixed, and it cannot be deleted separately. Custom folders also keep their names and ownership. At the records API, an empty custom folder accepts a bare DELETE. A folder with any linked notes requires the snapshot from its private deletion preview. A stale snapshot returns HTTP 409 and preserves the entire folder. Deleting the account removes its folders and notes.

## Account and appearance

Open **Account** at the foot of Folders to manage [two-step sign-in](auth.md). **Back to notes** returns to All Notes. Open the user menu below Account to choose a light, dark or system theme or to log out. With unsaved writing, Log out opens the [draft choices](notes.md#leaving-a-draft).
