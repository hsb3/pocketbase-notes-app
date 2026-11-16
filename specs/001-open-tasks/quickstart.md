# Quickstart: validate Open tasks

Prereqs: Docker, Bun, `.env` with superuser credentials.

1. `make app STACK=pbn-tasks STACK_PORT=8260 STACK_MAILPIT_PORT=8261 STACK_RUSTFS_CONSOLE_PORT=8262`
2. Open http://127.0.0.1:8260, sign in with the seed account; "Open tasks" in the left rail lists the seeded
   unchecked items grouped by entry; entries with open items show a count in the entry list.
3. Tick an item: it disappears; open its entry; it is checked.
4. API: `TEST_PB_URL=http://127.0.0.1:8260 bun run scripts/test-entries.ts` → `PASS ... tasks`.
5. Browser: `VITE_PB_URL=http://127.0.0.1:8260 TEST_APP_URL=http://127.0.0.1:8260 bunx playwright test tasks`.
