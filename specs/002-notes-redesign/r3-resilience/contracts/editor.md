# Editor recovery contract

## What the writer sees

Use the existing document header at 390, 810 and 1440 CSS pixels. The same named live status stays visible above the scrolling editor. Use text, keyboard focus and theme tokens in both themes. Keep actions next to the explanation and status announcements polite and distinct from buttons.

| State | Visible feedback and actions |
|---|---|
| Idle | Blank new note has no Saved badge. A previously loaded, verified detail can start Saved. |
| Pending | On input, remove Saved immediately. Later edits during an outstanding write remain Pending until their own acknowledgement. |
| Saving | Show Saving while the latest submission is outstanding. Keep typing enabled. A pause starts I/O within 1000 ms, normally after the existing 500 ms debounce. |
| Saved | Only the latest acknowledged generation of this active, owned draft can display Saved. Announcing an earlier generation, even for one intermediate render, fails SC-002. |
| Failed / Retry | Within 1000 ms of known failure, explain that the draft is unsaved and expose Retry. Continue editing in place. Retry uses the latest body and the [read-back rules](../data-model.md#owner-read-back); double activation or a simultaneous Back joins one operation. |
| Invalid, locked, conflicting or unavailable | Give the specific action: correct and retry, sign in, review the conflict, or copy retained words. Clearing a saved note explains that it needs writing or an attachment. Oversize feedback names the 100 KB limit. Never truncate or clear the input. |

## Leave and sign-out

1. Route links to folders, page changes, another note, Account, Compose, editor Back and same-document browser Back/Forward through one guard. Check before changing selection, allocating a replacement draft or clearing auth. Keep any list-position restoration tied to the accepted transition. Ignore a no-op navigation to the current note.
2. Ordinary in-app leave flushes immediately, joins any current write, drains later typing and rechecks the latest generation before proceeding once. A failed, invalid, locked or conflicting draft keeps the destination pending and offers **Save and continue**, **Discard** and **Keep editing**. If already failed, blind navigation never loops on its own. In a conflict offer review instead of enabling a write over the saved version.
3. Explicit sign-out with unsaved work opens this choice *before* flushing or entering the existing logout route. Pause the debounce and queued dispatch while this choice is open. If an already-sent write settles, acknowledge only that snapshot. Discard must never send a queued generation; Keep editing restores normal scheduling for healthy edits. Save and continue tries the latest valid draft and releases only after proven success. On failure stay signed in with Retry or the appropriate recovery action. Discard abandons only outstanding local edits, never deletes or reverts a committed record. Resolve/drain an in-flight request before enabling destructive choices. Keep editing or Escape cancels the intent, preserves the draft and restores focus. Coalesce repeated intents so a stale dialog cannot sign someone out later.
4. On browser reload, tab close or a full-page departure, use the browser's native Stay/Leave warning while an active draft is dirty, saving or unresolved. Staying returns to the draft, where the writer can save or discard. Leaving ends the in-memory session. Guard the sign-in interlude for a suspended draft too. Unregister the warning when safe. No async save promise or custom three-button dialog can be guaranteed at unload or on mobile process termination. [Browser behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)

## Reauthentication

Capture the immutable ordinary user's ID on draft creation. On expiry or auth-store identity change, stop writes and park the draft *before* the keyed library unmounts. While credentials are missing, hide the private editor, list, title and conflict UI. The sign-in screen can say the draft is held in this tab. Clear an invalid token only after parking, and allow this specific internal transition without consuming a pending sign-out. Reuse the existing SPA login and its MFA/OAuth completion. Its normal redirect to the library provides the point to resume. Keep the draft and its return address out of login parameters, history payloads, persistent storage and logs.

After verified sign-in, look up a parked draft by the returned account ID before loading or displaying a note. The same owner can reopen that stable URL and Retry, reconciling uncertain writes first. A different owner opens their own library, with no prior-account status, words, selection, actions or writes. Keep the first owner's suspended draft private in tab memory for their later return. Direct account switches (including an auth-store change from another tab) invalidate pending callbacks and bypass stale route selection. Failed login or an incomplete second factor leaves the draft locked. Explicit successful sign-out after save/discard removes that owner's session draft.

## Conflict

A real 409 triggers a fresh owner read; an exact submitted snapshot can be acknowledged. For a differing active server version, show a titled dialog explaining that the saved version is newer and the local edits remain unsaved. Offer **Copy draft**, **Reload saved** and **Cancel**. Copy uses the current visible local words in order, including paragraph breaks and mention labels. It requires a user gesture and reports success only after clipboard success. On denial keep the draft selectable and give a manual copy instruction. Cancel or Escape returns focus to the editor and leaves a visible action to reopen the conflict. Subsequent edits stay local.

Reload saved first opens an explicit replacement confirmation. Default focus goes to the safe choice. Cancelling either dialog preserves both versions. Only on confirmation fetch the current owner detail again. A failed, deleted or unreadable result keeps the draft copyable. A successful fetch, with owner, draft and generation still current, replaces body, ordered attachments and revision together and remounts the ProseKit view once, even for the same ID. If local edits intervened during the read, ask again before replacing them. Reload and Copy perform no writes. Neither advances the server revision.

Use the existing shadcn Dialog and Button and restore the missing AlertDialog for the leave and destructive-reload confirmations during implementation with `bunx --bun shadcn@latest add alert-dialog`. Inspect the CLI diff: use the installed `radix-ui` package, preserve existing shared primitives and keep package pins. A new dependency requires an explicit owner decision.
