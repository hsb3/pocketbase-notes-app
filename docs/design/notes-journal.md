# Notes and journal — design draft

Status: implemented with ProseKit following the build request. See [verification](../VERIFICATION.md).

[Open the wireframes](notes-journal-wireframes.html). Static diagrams describe one coherent flow, not working screens. This design supersedes the [project tracker proposal](project-tracker.md).

## Product and scope

A private place to capture ideas and reflect on a day. Sign in, write a note or dated journal entry, save it, and find it again. Writing is the main screen; there is no metrics dashboard.

First release: notes, dated journal entries, a basic rich-text editor, title search, date filtering for journals, favorites, editing and deletion with confirmation. Notes and journal entries share one collection and editor. Multiple journal entries may share a date; there is no daily uniqueness constraint or streak mechanic. No folders, tags, attachments, AI, collaboration, public sharing, offline mode or reminders in this release.

## Layout and flows

### Library — /entries

Desktop uses three regions: compact Sidebar, entry list, and reading/writing area. The sidebar has a visible collapse/expand control. Existing entries and new drafts offer full-screen writing mode, which hides navigation and the list while preserving the draft; exiting restores the previous sidebar state. Sidebar links are All entries, Notes, Journal and Favorites, with account/logout at the bottom. Main navigation is built from links; All entries includes both types, and Favorites includes starred entries of either type.

The list contains title search, New entry, and rows with title, a short plain-text preview, entry kind, and date. Sort notes by last updated, newest first; sort the Journal view by journal date descending then last updated. All entries and Favorites sort by last updated. Load 20 rows per page with Previous/Next as needed. No hidden infinite scroll. Changing view, search or journal date resets pagination to page 1. A selected entry is highlighted, but selection never depends on color alone.

With nothing selected, the writing area invites New note or New journal entry. The Journal view adds a Calendar in a Popover for selecting one date, a clear-date action, and a Today shortcut. Today uses the browser's local calendar date at click time. Opening the journal does not silently create a record.

### Writing — /entries/new and /entries/$entryId

New entry offers Note or Journal, defaulting to the current Notes/Journal view (otherwise Note). The type can change before the first save; afterward it is fixed. New journals default to today's local date, which is editable independently of creation time. Use a date-only YYYY-MM-DD value, not a UTC timestamp conversion.

The editor has a title field, kind/date metadata, favorite toggle, restrained formatting toolbar, writing surface, save status and explicit Save. First-release formatting: paragraphs, headings, bold, italic and blockquotes. No custom block editor or slash-command system. Empty title saves as “Untitled note” or “Journal — YYYY-MM-DD”; wholly empty body is rejected with a nearby message. A useful default title permits starting directly in the body.

States: Unsaved changes → Saving… → Saved. Save writes title, body, date and favorite together. Disable editing and repeated submission during the short pending request. On failure keep the draft visible, show “Could not save” with Retry, and never claim success. Ctrl/Cmd+S triggers the same save action when the editor is active.

New drafts remain in memory until Save; Cancel returns to the previous list. The first successful Save replaces `/entries/new` with `/entries/$entryId`; subsequent saves update that record, never create duplicates. Leaving a dirty draft, switching entries, or logging out prompts Save / Discard / Keep editing. Browser refresh/close uses the browser's standard unsaved-change warning. No promise of draft recovery after a browser crash. A session expiry preserves the visible draft and offers reauthentication; do not navigate away automatically and lose it.

Existing entries open directly from a URL. Back to list retains view/search/date/page. A selected entry that no longer matches filters remains visible until navigation, with a “Not in this filtered list” note. Missing or unauthorized entries show the same generic unavailable screen.

The overflow menu offers Delete entry. An Alert Dialog names the entry and explains that deletion is permanent. Cancel receives initial focus. Confirmed deletion returns to the list; failure preserves the entry.

### Mobile

Show one region at a time: entry list or editor. Navigation opens in a Sheet. Back returns to the prior filtered list. Save stays accessible above the editor; the short toolbar wraps. Journal date picking uses the same Calendar/Popover. Use viewport-safe spacing and scroll behavior with the software keyboard; no horizontal page scrolling.

## Reuse plan

| Need | Existing or prebuilt source | Adaptation |
| --- | --- | --- |
| Navigation | shadcn Sidebar + Sheet | Four views and account menu, no custom navigation system |
| Search and entry list | InputGroup, Item, Separator, Pagination | Title-only search; labeled, linked rows |
| Writing | Community `@prosekit/react-example-minimal` and ProseKit extensions | Adapt the registry example into the feature editor with a restricted document schema |
| Formatting | shadcn ToggleGroup with ProseKit commands | Expose only the agreed formatting, with accessible names |
| Journal date | shadcn Calendar + Popover | Date-only value, Today and Clear controls |
| Metadata and actions | Field/FieldGroup, Input, Badge, Toggle, DropdownMenu | Reuse existing Button/Input utilities where compatible |
| Feedback | Empty, Skeleton, Alert, Spinner, Sonner, AlertDialog | Loading, failures, saves and destructive confirmation |

The official shadcn CLI recognized the existing Vite/Tailwind/Radix setup. The component configuration now explicitly selects Tabler icons, matching the existing source. Keep the existing neutral semantic tokens and installed icon library. No preset or base-library migration is proposed.

The ProseKit React registry example was installed, then adapted into `src/features/entries/rich-text.tsx`. Only the supported text, paragraph, heading, blockquote, bold, italic and hard-break extensions are enabled. Browser tests verify formatting and JSON persistence through PocketBase.

Sources: [shadcn skill](https://ui.shadcn.com/docs/skills), [component catalog](https://ui.shadcn.com/docs/components), [registry directory](https://ui.shadcn.com/docs/directory), [ProseKit React example](https://prosekit.dev/r/react-example-minimal.json).

## Data and routing

One new `entries` collection: required immutable `user` relation, required immutable `kind` select (`note`, `journal`), title text (max 160), body JSON (max 100 KB), `journal_date` text (valid YYYY-MM-DD for journals, empty for notes), favorite boolean, revision integer, and server creation/update timestamps. Validate the supported editor node structure, nesting depth and text limits server-side. Reject unknown node types and raw HTML; render through the editor, never unsanitized HTML. List previews derive from stored body text and are not separate editable data.

All five collection operations require authentication and matching user ownership. Creation requires the current user as owner; updates prohibit ownership/type reassignment. Filters bind input using `pb.filter()`. Test two-user isolation for list, direct read, create, update and delete; do not treat a successful empty list alone as proof of authorization.

A save carries the loaded revision. The server atomically checks and increments it; stale saves are rejected without overwriting the newer content. Preserve the local draft and offer Copy draft and Reload saved version. No automatic merge or force-overwrite in v1. The update-request hook performs the revision check and save within one PocketBase writer transaction; concurrent-save behavior is covered by the API test.

TanStack Router owns the protected layout, `/entries`, `/entries/new`, and `/entries/$entryId`; validated search parameters carry `view`, `q`, `date` and `page`. Date filtering applies only to Journal. Route loaders fetch paginated records and selected entries; mutations invalidate affected loaders without replacing a dirty editor. Normal post-login navigation and the old dashboard redirect to `/entries`. Existing authentication flows remain.

Follow the existing schema/migration/type-generation workflow. Reuse the typed PocketBase client. No TanStack Query/Table dependency is needed. No realtime subscription is proposed; navigation/reload sees server changes, and revision checks protect against stale saves.

## Acceptance and verification

- Create a note and journal entry, format text, save, reload and recover identical supported content. Backdating a journal survives timezone changes without changing its date.
- Search, date filter, favorites and pagination survive refresh/back navigation. A direct entry URL works without first visiting the list.
- Exercise empty library, no matches, loading, unavailable entry, save error, invalid content and session expiry. Errors preserve the draft.
- Canceling navigation keeps edits; successful Save then navigation preserves them. Two tabs editing the same entry cannot silently overwrite each other.
- Another account and an anonymous client cannot read or mutate entries. Ownership/type reassignment and malformed editor bodies are rejected server-side.
- Keyboard users can navigate the list, format content, save, use date controls and exit dialogs; labels, focus and save announcements are explicit. Verify desktop and narrow-screen layouts live.
- Run lint/build and focused behavior tests, then exercise the complete loop against seeded PocketBase. Static wireframes are not runtime proof.

## Implementation order

The editor, persistence, navigation and failure paths are implemented. Kata registration remains pending because the current server does not recognize this repository alias. Future work remains outside this release: offline drafts, attachments and sharing.
