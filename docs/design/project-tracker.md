# Personal project tracker — design draft

Status: superseded by the [notes and journal design](notes-journal.md). Retained as an earlier proposal; do not implement.

[Open the wireframes](project-tracker-wireframes.html). These static, low-fidelity screens describe one coherent flow; controls are illustrative, not functional.

## Purpose and first release

A private workspace for turning small projects into completed tasks. The complete loop is sign in → create a project → add tasks → find and update a task → see completion persist after refresh.

The first release includes project creation and editing, task creation/editing/deletion, task status, search and filtering, notes, and one optional task attachment. Projects can be archived and restored; permanent project deletion is deferred to avoid accidental cascading data loss. Each account sees only its own records. Existing authentication flows remain available.

Excluded: shared teams, invitations, assignments, comments, notifications, due dates, priorities, drag-and-drop boards, analytics, and rich-text editing. Notes are plain text. No separate dashboard metrics page.

## Screens and navigation

### Projects — /projects

Default destination after login. A compact sidebar contains Projects and an account menu with logout. The content header has a New project action. Active/Archived tabs switch the collection shown. Cards contain the project title, short description, completed/total task count, and progress bar. The title opens the project. Progress means done tasks divided by all tasks; an empty project reads “No tasks yet,” not 100%.

New project opens a dialog with title and optional description. Successful creation navigates into the empty project. A project menu on the detail screen provides edit and archive/restore. Archived projects and their tasks are read-only until restored.

### Project tasks — /projects/$projectId

Breadcrumb back to Projects, project title and description, progress, and one primary Add task action. A search field matches task titles; a status selector offers All, To do, In progress, Done. Rows show completion checkbox, task title, status badge, and an overflow menu. The title opens the task detail route. Checking a task sets Done; unchecking a completed task sets To do. In progress is chosen in the editor.

Search, status, sort direction, and page live in validated URL search parameters. Changing search/filter resets the page. Default ordering is newest first; a simple Newest/Oldest selector is sufficient. Use server pagination, 20 tasks per page, with Previous/Next controls when required. Project progress always describes all tasks, not just the current page or filter.

Add task opens a dialog with required title, optional plain-text notes, and status defaulting to To do. Keep attachment management on the detail screen to keep quick creation short. On success, close the dialog, refresh records and counts, and announce success. A filter may hide the new task; the success message offers Open task.

### Task detail — /projects/$projectId/tasks/$taskId

A full page with a breadcrumb back to the project, retaining its filter state when entered from the list. Direct links work independently. Show title, status, notes, and an optional attachment with filename and download action. Edit task opens the same form used for creation. Attachment upload/replacement/removal is separate, with explicit pending and failure states. Delete task uses an Alert Dialog naming the task; success returns to the project list.

### Narrow screens

Sidebar becomes a Sheet opened from a labeled menu button. Project cards become one column. Task rows retain checkbox, linked title and status; secondary actions move into the overflow menu. Search and filters stack. Dialogs fit the viewport and scroll internally. Task detail uses one column. No horizontal page scrolling is required.

## Component plan

Reuse the existing Button, Input, Label, Separator, form helpers and Tabler icons. Add shadcn components only as screens need them: Sidebar/Sheet, Card, Badge, Progress, Tabs, Dialog, Textarea, Select, Table, Checkbox, Dropdown Menu, Breadcrumb, Alert Dialog, Skeleton and Sonner. Account identity can use Avatar with initials fallback.

Use the basic shadcn Table with explicit server controls. TanStack Table and TanStack Query are not required for this scope. Component installation can introduce dependencies; inspect and obtain the repository-required dependency approval before installation.

## Behavior and accessibility

- Empty account: “Start a project” with a Create project action. Empty project: “Add the first task.” Filtered empty result: “No matching tasks” with Clear filters.
- Loaders show skeletons; failed loads show a plain error and Retry. Missing or inaccessible records share a generic not-found screen without revealing another account's data.
- Save buttons remain disabled while pending. Errors preserve entered values. Wait for server confirmation before changing completion state; failed requests keep the original state and offer retry.
- Forms use visible labels, inline validation linked to fields, and focus on the first invalid field. Dialogs restore focus to the trigger after closing.
- Task links and completion checkboxes have separate targets; checkbox labels include task titles. Status is written in text, never color alone.
- Destructive dialogs start focus on Cancel. Success announcements use a live region. All actions must work with a keyboard.
- Attachment controls accept one PNG, JPEG, WebP or PDF, at most 5 MB. Server validation matches the client. Files are protected and download requires authorized access. No HTML/SVG uploads or automatic external URL fetching.

## Data and access design

| Collection | Fields |
| --- | --- |
| Existing users | Existing authentication/profile fields |
| projects | user: required single users relation; title: required text, max 100; description: optional text, max 500; archived: boolean; created/updated timestamps |
| tasks | project: required single projects relation; title: required text, max 160; notes: optional text, max 10000; status: required select `todo`, `in_progress`, `done`; attachment: optional protected single file; created/updated timestamps |

Project ownership is immutable. A task's project relation is immutable after creation. All collection rules are decided before UI integration: authenticated accounts may list/view only their own projects and related tasks; create/update requires ownership; task writes require an active project; project deletion stays locked. Task deletion requires ownership of an active project. Protected-file access follows task view permissions. Exact PocketBase rule syntax must be checked and tested against the pinned server during implementation.

Backend migrations are the schema source of truth. Follow the repository's [feature workflow](../../.agents/context/feature-workflow.md): create schema through the local admin UI, retain generated migrations, regenerate SDK types, and extend seed data. Do not hand-edit generated types.

Use PocketBase paginated reads with bound filters, not interpolated input. Progress needs total and done counts independent of pagination. Start with count queries for the selected project and a bounded project page; reassess batching only if measured request volume warrants it. No realtime synchronization in the first release; successful mutations invalidate relevant route loaders, and reload retrieves fresh data.

## TanStack Router responsibilities

Protected parent routes enforce login. Route loaders retrieve project/task data and verify that the task belongs to the project named in the URL. Validated URL parameters carry view state and loader dependencies. Pending/error/not-found boundaries cover route loads. Mutations use the existing typed PocketBase client and invalidate affected loaders. Existing auth redirects remain supported; the normal post-login destination becomes /projects. The old /dashboard route redirects to /projects.

## Implementation slices and acceptance

1. Schema, access rules and seed data: two accounts can each create their own projects/tasks; cross-account list, direct read, edit, delete and file access fail. Unauthenticated access fails. Ownership/relation reassignment fails. Archived task writes fail.
2. Projects and task list: create a project/task, refresh, and find both persisted; toggle completion and verify the count; change a filter and verify refresh/back preserve it; pagination never changes total progress.
3. Details and editing: open a task URL directly, edit notes/status, upload/download/remove an allowed file, reject an oversized or disallowed file, and delete only after confirmation. A mismatched project/task URL is not found.
4. End-to-end polish: archive/restore works; keyboard flows and narrow layouts are usable; empty/loading/error states are exercisable. Existing auth still works. Run lint/build and verify against the live backend, with regression coverage for access boundaries and the core create/edit/complete loop.

## Review decision

Confirm the screen structure and first-release scope before implementation. Visual styling beyond the existing neutral theme is intentionally undecided. Tracker registration is pending because the local Kata session lacks KATA_AUTH_TOKEN.
