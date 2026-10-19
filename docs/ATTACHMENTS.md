# Full editor and private attachments

The editor is adapted from `@prosekit/react-example-full`. It includes the upstream
toolbar, inline formatting and link menu, slash commands, lists, tables, code blocks
with highlighting and Mermaid previews, math, drag handles, resizable images and
paste/drop image uploads. Demo documents, people and tag suggestions are not loaded.

## Uploading

Use **Insert Image** in the formatting toolbar, or paste/drop an image into the
editor. Use **Attach files** beside the entry metadata for downloadable files.
Uploads are allowed before the first Save. Save commits the document and attachment
references together; it is disabled while an upload is running.

Supported files: PNG, JPEG, WebP, GIF, PDF and plain text/Markdown. Limits: 10 MB per
file and 20 attachments per entry. Both client checks and PocketBase constraints
apply. Downloads preserve the original filename. Removing a file from the attachment
list also removes its inline image references; Save persists the removal.

## Storage and access

The `attachments` collection holds an immutable user relation, original filename and
one protected file. The `entries.attachments` multi-relation records saved references.
Rules restrict creation, reading, listing and deletion to the authenticated owner;
normal clients cannot replace file records. Entry validation rejects another user's
attachment or an image reference missing from the entry's attachment list.

With `make up-full`, files are stored in MinIO. The client uploads through PocketBase,
never directly to MinIO. Private images serialize as `attachment:<record-id>`. The
image view obtains a short-lived file token and renders a fetched blob URL; neither
that token nor the blob URL is saved in the document. Downloads use the same protected
flow. External HTTP(S) image embeds remain external resources rather than attachments.

Deletion requests check saved references inside a database transaction. Referenced
files cannot be deleted. Best-effort cleanup after Save, Discard and entry deletion
removes unreferenced files. An hourly job deletes at most 100 unreferenced uploads
older than 24 hours, covering abandoned browser drafts; recent uploads and referenced
files are retained. Unsaved drafts still live only in memory.

## Document contract

PocketBase validates supported node/mark types, structure, attributes, safe link and
image schemes, image ownership, document size (100 KB), depth and node count. Images,
PDF/text attachments and ordinary text can make an entry nonempty. Old simple notes
remain valid. Revision checks and conflict recovery apply to attachment references
as well as document content. Copy-text conflict recovery does not copy formatting or
files; download unsaved files before discarding a conflicting draft.

## Verification

- `bun run scripts/test-attachments.ts`: full JSON document round trip; real MinIO
  object; protected download; cross-account and anonymous denial; invalid/oversized
  files; unsafe URLs; reference-protected deletion. The cleanup SQL is tested with
  old referenced, old unreferenced and recent fixture rows; the live job retains a
  fresh upload.
- `node --env-file=.env scripts/test-editor-files.cjs`: real browser upload before
  first Save, private image insertion/reload, text download bytes, underline, slash
  table creation, removal and rejected uploads. Requires Playwright/Chromium and the
  running Vite/full backend; a global install can use `NODE_PATH`.
- `scripts/test-browser.cjs` continues to cover ordinary notes, navigation, saves,
  conflicts, expiry recovery, sidebar/full-screen behavior and mobile layout.

Source: [ProseKit full registry block](https://prosekit.dev/r/react-example-full.json).
[Upstream license notices](design/prebuilt-ui.md#source-notices) apply to copied code.
