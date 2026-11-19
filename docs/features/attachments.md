# Private attachments

The notebook can display an existing private image and preserve its reference through autosave and reload. File picking, uploads and attachment management in the editor are planned for R11. [Notebook and roadmap](notes.md#later-increments-and-source-recovery)

## Storage and access

Upload an attachment through PocketBase. Each record holds an immutable user relation, original filename and protected file. Supported types include PNG, JPEG, WebP, GIF, PDF and plain text/Markdown. Each file can be up to 10 MiB, and a note can reference up to 20 attachments. The local full stack stores files in RustFS.

A private image in the document stores `attachment:<record-id>`. The image view fetches the protected file with a short-lived token and displays a blob URL. The saved content contains only the reference. Anonymous and other-account downloads are denied.

## Saving and removing references

An attached file must belong to the note’s account, and each embedded private image must appear in the ordered `notes.attachments` relation. A body-only update preserves this relation. To detach an embedded file through the API, update the body and attachment list together using the current revision. A stale revision leaves both intact.

The server checks references again inside the deletion transaction. An hourly job removes up to 100 unreferenced uploads older than 24 hours. Referenced files and recent uploads survive the sweep.

Moving a note keeps its ordered file references. A note in **Recently Deleted** still protects its files. Restoring it brings back the same references and private bytes, including when the original folder is gone. [Restore a note](notes.md#move-delete-and-restore)

At expiry, the daily purge checks references from every surviving note, including deleted notes awaiting purge. Shared files stay private and readable to the account. When the last reference goes, the purge removes the attachment record and PocketBase schedules physical removal of its original and thumbnails after commit. A failed removal or a late thumbnail can leave bytes in private storage. [Check and remove leftover files](../../deploy/OPERATIONS.md#verify-files-after-note-purge)

## Verification

`make test-api-contained` exercises real uploads, protected bytes, denied reads, invalid files, revision-checked detachment and both cleanup jobs. It compares a generated thumbnail with its stored bytes, checks exact keys after purge and downloads surviving shared files. `make test-browser-contained` verifies that rich text and a private image survive a body edit and reopen. [Verification](../testing/verification.md)

The adapted editor retains the [ProseKit license notice](../design/prebuilt-ui.md#source-notices).
