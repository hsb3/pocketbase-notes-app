# Technology evaluations

Build-or-buy decisions, researched from primary sources, with the claims that decide each one checked a second time by a reviewer trying to disprove them. Each evaluation folder holds:

- `data/requirements.yaml`: the decision, the hard filters and the capabilities
- `data/eval-rubric.yaml`: the scoring
- `data/findings/`: one file per candidate, with sources and verification
- `report.md`

| Evaluation | Date | Outcome |
|---|---|---|
| [Multi-device sync, edit queue and presence](sync-and-presence/report.md) | 2026-11-21 | Three layers, adopted in order: give metadata its own write path so it never conflicts with body edits; then live updates and presence on PocketBase realtime; then Yjs through ProseKit only if merged co-typing is wanted (server-side decoding is proven in PocketBase 0.40). |
| [Rich-text editor foundation](rich-text-editor/report.md) | 2026-11-21 | Keep ProseKit; Tiptap is the fallback. CKEditor 5 has GPL terms and stores notes as HTML; CodeMirror is a code-block component, not a note editor. |
| [Build-vs-buy inventory](build-vs-buy-inventory.md) | 2026-11-21 | Replace the auth form-state hook with native form validation; consider Router loaders, SQLite FTS5 search, a ProseMirror schema validator and `bun test`. |

To start a new evaluation, follow the same layout. Files under [schemas/](schemas/) validate it.
