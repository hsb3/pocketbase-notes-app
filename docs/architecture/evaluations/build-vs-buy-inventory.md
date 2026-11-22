# Build-vs-buy inventory

Date: 2026-11-21

## Method

- I read the homegrown code in `src/`, `pb/hooks/` and `scripts/`.
- Out of scope: generated files, `src/components/ui` (shadcn), `src/components/editor`
  (vendored ProseKit examples), and the sync area (`src/features/notes/draft.ts`,
  autosave, revision checks, presence). Other evaluations cover those.
- Facts about packages come from primary sources only: the GitHub API (stars, LICENSE
  file, commits since 2026-05-21, releases), the npm registry and download API, and
  official docs. Line counts come from `wc -l`.
- Effort scale: native (the platform or an installed package does it), documented
  adapter, community example, DIY.
- I list an area only when a credible package or platform feature exists, or when I
  need to explain why there is none.

## Inventory

| Area | Homegrown today | Mature option (license, maturity) | Effort | Verdict |
|---|---|---|---|---|
| Auth form state | `src/hooks/use-form-state.tsx` (100 lines) and `src/utils/form.ts` (11 lines), used by 4 auth forms in `src/features/auth/auth.tsx` and `password-reset.tsx`. `formHandler` is also used in `src/features/account/security.tsx`. The rules only check blank fields, an `@`, length 8 and a password match. | 1) HTML constraint validation (`required`, `type=email`, `minLength`, `setCustomValidity`), a platform feature, no package. 2) react-hook-form (MIT; 44.9k stars; 386 commits in window; v7.92.0 on 2026-11-11; 68.1M downloads a week). Not installed. | Native (1) or documented adapter (2) | Replace with native constraint validation. Use react-hook-form only if forms grow. |
| List loading | `src/features/notes/note-list.tsx` (about 25 of 360 lines: effect, refresh and retry counters, stale-reply guard). `src/features/notes/recently-deleted.tsx` (about 80 of 492 lines: ticketed reads, refresh on visibility and on expiry). `src/features/notes/workspace.tsx` loads folders in an effect. | 1) TanStack Router loaders with `loaderDeps`, `staleTime` and stale-while-revalidate caching. Already installed (`@tanstack/react-router` ^1.170). 2) TanStack Query (MIT; 50.6k stars; 1,408 commits in window; v5.108.2 on 2026-11-20; 92.0M downloads a week). Not installed. | Documented adapter | Consider. Try Router loaders first, since they are already installed. |
| Note search | `pb/hooks/note-search.js` (141 lines), `pb/hooks/comparison-key.js` (1 line), the `search_key` column and its repair migration. It stores an NFC upper-case key and matches it with `~` (LIKE). It maps the match back to the original text for the snippet. | SQLite FTS5 with the `trigram` tokenizer and `snippet()`/`highlight()`. It ships in the prebuilt PocketBase binary (modernc SQLite). PocketBase does not manage FTS tables: you build the virtual table and keep it in sync yourself. | DIY | Consider, but not now. See notes. |
| Body validation | `pb/hooks/entry-validation.js` (101 lines). It walks the ProseMirror JSON and checks node types, nesting, attributes, marks, safe links, attachment references and size limits. | prosemirror-model `Schema` + `Node.fromJSON` + `node.check()`, with attribute `validate` (since 1.22.0, 2024-07-14). MIT; 1.25.13 on 2026-11-08; 44.1M downloads a week; 0 commits in window, one maintainer, very stable. Installed only as a frontend dependency of ProseKit. | Community example / DIY | Consider. See notes. |
| API test scripts | `scripts/test-*.ts` (about 3,900 lines). Plain Bun scripts with `node:assert` at top level, chained in `package.json`. | `bun test` (`bun:test`), built into Bun. Already used in `scripts/local-target.test.ts`. | Native | Consider. See notes. |
| Contained test runner | `scripts/run-contained.sh` (315 lines). It wraps Docker Compose with random secrets, profiles and a 29-minute timeout. | testcontainers-node (MIT; 2.6k stars; 171 commits in window, mostly one maintainer plus Dependabot; v12.2.2 on 2026-11-19; 12.8M downloads a week). Not installed. | Documented adapter | Keep. Compose already does the container work. The script is mostly project policy (limits, secrets, profiles), and testcontainers would still need all of it. |
| Theme | `src/features/theme/theme.ts` (79 lines). It stores the choice in localStorage, follows the system setting and syncs across tabs. | next-themes (MIT; 6.4k stars; 0 commits in window; last release v0.4.6 on 2025-03-11; 37.0M downloads a week). The shadcn Vite dark-mode guide has you write your own ThemeProvider instead. | Documented adapter | Keep. The upstream guide for this stack is homegrown, and next-themes has gone quiet. |
| Countdown and mobile hooks | `src/hooks/use-countdown.tsx` (45 lines). `src/hooks/use-mobile.ts` (21 lines) comes from shadcn. | Small hook libraries exist. | Documented adapter | Keep. A new dependency for 45 lines breaks the project's dependency rule. |
| Folder name uniqueness | `pb/hooks/folders.pb.js` sets `name_key` from `comparison-key.js`. A unique index on `(user, name_key)` enforces it. | SQLite `COLLATE NOCASE`. | Native | Keep. NOCASE folds ASCII letters only, so non-ASCII names would slip past it. |
| Dates | `Intl.DateTimeFormat` in `recently-deleted.tsx`. The journal date check in `entry-validation.js` is about 3 lines. | date-fns, Day.js and similar. | n/a | Keep. The code already uses the platform. |
| MFA and auth | `pb/hooks/mfa.pb.js` (69 lines) and `pb/hooks/signup.pb.js` (14 lines) add guards around PocketBase's own MFA, OTP, password, verification and reset flows. | PocketBase built-in auth (already in use). | Native | Keep. The flows are already native. The hooks only add rules PocketBase does not have: a password to toggle MFA, and decoy OTP replies. |
| Purge and attachment cleanup | `pb/hooks/note-purge.pb.js` (86 lines), `pb/hooks/attachments.pb.js` (21 lines) and `pb/hooks/attachment-cleanup.js` (9 lines). They run on PocketBase's `cronAdd`. | PocketBase has no TTL or soft-delete feature. Cron jobs are native and already used. | Native (scheduler only) | Keep. The rules (30-day retention, sharing check, key logging) are app-specific. |
| Backups | `scripts/check-backups.ts` and `scripts/test-backups.ts` check PocketBase's native scheduled S3 backups. | PocketBase backups (already in use). | Native | Keep. Only the checks are homegrown. |

## Notes on Replace and Consider rows

### Auth form state: Replace

- The validation rules are ones the browser already enforces: `required`,
  `type="email"`, `minLength={8}`, and `setCustomValidity` for the password match.
- The forms put PocketBase's per-field errors into the hook with `setError`. A plain
  `useState` map of server messages per field would replace that.
- The change deletes `use-form-state.tsx`. `formHandler` can become a plain
  `onSubmit` that calls `event.preventDefault()`.
- Risk: native error bubbles look different from the current inline messages. If the
  owner wants inline messages, read `validationMessage` on `invalid` events, or
  adopt react-hook-form.

### List loading: Consider

- The list effects rebuild a small fetch cache by hand: a refresh counter, a retry
  counter, a guard against stale replies and a session check.
- A Router `loader` keyed on `loaderDeps` (folder, page, q, sp) gives caching,
  dropping of stale replies and `router.invalidate()` for refresh, with no new
  dependency.
- Caution: the list is tied to the leave dialog, focus restore and the flicker
  measurements. Move one view at a time, starting with Recently Deleted, and rerun
  the flicker checks.
- Add TanStack Query only if several views end up sharing one cache.

### Note search: Consider, not now

- What FTS5 trigram would remove: the folding key, the `search_key` column and its
  repair migration, and about 100 lines of snippet offset mapping (`snippet()` does
  that).
- What it costs:
  - a custom route (`routerAdd`), because PocketBase list filters cannot query a
    virtual table;
  - sync on create, update and purge;
  - a fallback for terms under 3 characters, which match nothing in a full-text query;
  - a change in matching rules: SQLite's case folding is not JavaScript's
    `toUpperCase` (for example `ß` and `SS`).
- Today's LIKE scan is fine for one owner's notes. Revisit if search gets slow.

### Body validation: Consider

- `node.check()` would replace the checks on node types, nesting and marks, and
  attribute `validate` functions would replace the checks on attribute types.
- These checks stay app code: safe links, attachment references, the empty-note rule,
  size and depth limits, and task extraction.
- Cost: the ProseKit schema is built in the frontend. The server would need its own
  copy of the schema, bundled to CommonJS for PocketBase's Goja engine (ES5 with
  partial ES6, CommonJS `require` only). Keeping two schemas in step is a new risk.
  The gain is perhaps 50 lines.

### API test scripts: Consider

- `bun test` is already installed. It gives named tests, `--test-name-pattern`
  filtering, timeouts per test, and a report that does not stop at the first failure.
- Moving over is mechanical: wrap each existing `async function` check in `test()`.
- The live-stack setup stays as it is.

## Sources (all checked 2026-11-21)

- react-hook-form: https://github.com/react-hook-form/react-hook-form (LICENSE: MIT),
  https://registry.npmjs.org/react-hook-form/latest,
  https://api.npmjs.org/downloads/point/last-week/react-hook-form
- TanStack Query: https://github.com/TanStack/query (LICENSE: MIT),
  https://registry.npmjs.org/@tanstack/react-query
- TanStack Form, which I looked at and did not pick: https://github.com/TanStack/form
  (MIT; 6.8k stars; 72 commits in window; @tanstack/react-form 1.33.5 on 2026-08-11;
  7.4M downloads a week)
- TanStack Router data loading:
  https://tanstack.com/router/latest/docs/framework/react/guide/data-loading
- HTML constraint validation:
  https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Constraint_validation
- SQLite FTS5 trigram tokenizer: https://www.sqlite.org/fts5.html (section 4.3.4)
- FTS5 in PocketBase, maintainer comments (2022-08-22, 2023-02-25):
  https://github.com/pocketbase/pocketbase/issues/193; PocketBase go.mod
  (modernc.org/sqlite v1.60.1): https://github.com/pocketbase/pocketbase/blob/master/go.mod
- PocketBase JSVM (ES5, CommonJS): https://pocketbase.io/docs/js-overview/;
  routing: https://pocketbase.io/docs/js-routing/; cron:
  https://pocketbase.io/docs/js-jobs-scheduling/; MFA:
  https://pocketbase.io/docs/authentication/
- prosemirror-model: https://github.com/ProseMirror/prosemirror-model (LICENSE: MIT),
  CHANGELOG 1.22.0 (attribute `validate`), https://registry.npmjs.org/prosemirror-model
- Bun test runner: https://bun.com/docs/test
- testcontainers-node: https://github.com/testcontainers/testcontainers-node
  (LICENSE: MIT)
- next-themes: https://github.com/pacocoursey/next-themes (LICENSE: MIT); shadcn Vite
  dark mode: https://ui.shadcn.com/docs/dark-mode/vite
