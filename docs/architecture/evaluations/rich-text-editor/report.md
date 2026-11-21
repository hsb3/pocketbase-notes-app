# Rich-text editor foundation: evaluation

**Decision.** Which rich-text editor foundation should PocketBase Notes build on, for a private notes app used on phone and desktop?

**Date.** 2026-11-21. All facts are point-in-time and come from primary sources: repositories, LICENSE files, npm metadata, official docs, pricing pages and source code. Ten decision-critical claims were re-checked adversarially: 7 verified, 2 corrected, 1 verified with caveats.
- The corrections: one BlockNote XL package is AGPL, and ProseMirror moved off GitHub on 2026-04-01.
- The caveats are on CKEditor's GPL key and logo.

Evidence: [requirements](data/requirements.yaml), [rubric](data/eval-rubric.yaml), [findings per candidate](data/findings/).

## 1. Executive summary

Keep **ProseKit**. It is the only candidate that passes every filter, covers our whole feature list from MIT packages, and loads today's notes without conversion. Its weakness is project health:
- it is still pre-1.0;
- in practice one maintainer writes it (138 of 142 commits in six months, counting his bot account).

**Tiptap** is the named fallback.
- **Maturity:** the strongest of the field, with 16 recurring contributors, a shrinking backlog and 39M npm downloads a week.
- **Licensing:** every package we need is MIT, and collaboration works with self-hosted Hocuspocus.
- **Cost of switching:**
  - a one-off script to rename our nodes;
  - rebuilding the slash and drag menus from its free headless parts, because its ready-made menu components are paid.

**CKEditor 5**, which the owner asked about, is mature and good on mobile, but it is a poor fit here:
- its license is GPL;
- it requires a `licenseKey: 'GPL'` setting and always shows its logo;
- it stores notes as HTML, not JSON, so the server checks and title/search/task extraction would all need rewriting;
- real-time collaboration and slash commands are paid.

**CodeMirror**, also asked about, is the wrong layer for the main note editor. It is a reasonable code-block component later, but our Shiki code blocks already cover the need.

## 2. Comparison matrix

Legend: ✅ yes, free/OSS · ◐ partial (see notes) · 💰 paywalled · ❌ no (confirmed) · ❓ not documented.

| Candidate (layer) | License · filters | Checklists | Tables | Uploads | Code | Menus | Mobile | A11y | JSON schema | Reads our docs | Collab | Markdown | Maturity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **prosekit** (ProseMirror toolkit, incumbent) | MIT · pass | ✅ | ✅ | ✅ | ✅ | ✅ | ◐¹ | ◐ | ✅ | ✅ | ✅ | ◐² | early³ |
| **tiptap** (ProseMirror toolkit) | MIT · pass | ✅ | ✅ | ✅ | ✅ | ◐⁴ | ◐¹ | ◐ | ✅ | ◐⁵ | ✅ | ✅ | strong |
| blocknote (block editor on ProseMirror) | MPL-2.0 core; XL GPL/AGPL or proprietary⁶ · pass | ✅ | ✅ | ✅ | ✅ | ✅ | ✅⁷ | ❓ | ✅ | ❌ | ✅ | ◐ | early |
| milkdown (Markdown-first, ProseMirror) | MIT · pass | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ❓ | ◐ | ◐⁸ | ✅ | ✅ | adequate |
| plate (Slate toolkit) | MIT; Plate Plus proprietary · pass | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ❓ | ◐ | ❌ | ✅ | ✅ | adequate⁹ |
| lexical (Meta) | MIT · pass | ✅ | ✅ | ◐¹⁰ | ✅ | ◐ | ◐ | ✅ | ◐ | ❌ | ✅ | ✅ | early (pre-1.0) |
| ckeditor5 | GPL-2.0+; premium commercial · pass¹¹ | ✅ | ✅ | ✅ | ◐¹² | ◐ | ✅ | ✅ | ❌ (HTML) | ❌ | 💰 | ✅ | strong |
| remirror | MIT · **fail** (React 19) | ✅ | ✅ | ◐ | ✅ | ◐ | ◐ | ◐ | ✅ | ◐ | ✅ | ✅ | at-risk |
| codemirror (plain-text code editor) | MIT · **wrong layer** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ◐ | ✅ | ❌ | at-risk¹³ |

Notes:

1. Text input, IME and selection come from `prosemirror-view`, which ProseKit, Tiptap, BlockNote and Milkdown all share. Most mobile bugs are ProseMirror-level, so switching between these four does not escape them. Toolkit-level bugs exist too:
   - Tiptap #8626 (Backspace cancels IME) and #8348;
   - ProseKit #1743 (WebKit composition in its menus).
2. There is no Markdown serializer, only a remark/rehype recipe in the docs.
3. Two recurring human contributors, which meets the floor exactly and fails the preference. Last release v0.23.3, 2026-11-14. 17.6k npm downloads a week.
4. The headless pieces are MIT: `BubbleMenu`, `DragHandle` and `@tiptap/suggestion`. The ready-made `slash-dropdown-menu` and `drag-context-menu` components need a paid Start plan.
5. The JSON shape is the same, but stock node names differ:

   | Our (ProseKit) node | Tiptap node |
   |---|---|
   | `list` (`kind`, `checked`) | `bulletList` / `orderedList` / `taskItem` |
   | `tableHeaderCell` | `tableHeader` |
   | `mathBlock`, formula as text content | `blockMath`, formula in a `latex` attribute |

   Moving needs a migration script or custom node specs.
6. The `@blocknote/xl-*` packages are GPL-3.0 or proprietary, except `xl-ai-server`, which is AGPL-3.0. None is on our list.
7. It is the only candidate with an official mobile compatibility page. Four IME bugs filed on 2026-11-19 are still open.
8. Node names differ (`code_block`, `list_item`), and the presets have no underline mark.
9. 4 recurring contributors, but one author wrote 87% of commits. The v54 beta replaces Slate with the team's own fork, `plitejs`.
10. There is no first-party image node; the only one is in the playground app.
11. The open-source build requires `licenseKey: 'GPL'`. It is checked locally, and no usage request is sent, per `editor.ts`. It works only for npm or ZIP installs: the GPL key on the CKEditor CDN makes the editor read-only. The "Powered by CKEditor" logo is always shown under the vendor's policy.
12. The docs say live highlighting while editing is impossible.
13. One maintainer, and the project moved off GitHub on 2026-04-15. ProseMirror, under every ProseMirror option here, has the same shape and moved on 2026-04-01.

## 3. Shortlist profiles

**ProseKit (keep).**
- **What it is:** the MIT toolkit we use today.
- **Activity:** 1,235 stars; 49/39/13/12/20/14 commits a month from June to November; last release 2026-11-14.
- **Strengths:**
  - It already ships what the roadmap needs: checklists (R9), uploads with a pending state (R11), headless menus with a shadcn registry, Shiki code blocks, and Yjs and Loro extensions for any future sync.
  - Our server validator and title, search and task derivation are written against its JSON.
- **Caveats:**
  - The bus factor is about one.
  - It is pre-1.0 and Markdown support is partial.
  - Mobile reliability is not documented.
- **Effort to keep:** none.
- **Mitigation:** pin minor versions; keep a node-name map for Tiptap (note 5) so we could leave if needed.

**Tiptap (fallback).**
- **What it is:** an MIT ProseMirror toolkit with Tiptap GmbH behind it.
- **Activity:** 39k stars; about 106 commits a month; v3.35.0 on 2026-11-20; backlog down from 285 to 248; GitLab is an adopter.
- **Strength:** project health, and every capability we need in MIT packages on public npm, with no account.
- **Caveats:**
  - The polished menu components are paid.
  - Existing notes need a node rename.
  - It has its own mobile IME bugs.
- **Effort to switch:** a documented adapter. It would rewrite `src/components/editor/`, the server validator's node names and a data migration.

**CKEditor 5 (owner-named, not recommended).**
- **Maturity:** the strongest here, with 24 recurring contributors and Drupal core as an adopter.
- **Strengths:** first-class mobile and accessibility support.
- **Caveats:**
  - **License:** GPL. Our frontend bundle becomes a combined work, so the matching source must be offered when shipped. Our public MIT repository satisfies that; a closed fork would not.
  - **Data model:** HTML, not JSON. The server checks and title, search and task extraction would need rewriting against HTML.
  - **Paid features:** collaboration and slash commands. Its UI is its own, not shadcn.
- **Owner decision:** whether a mandatory `'GPL'` key and a permanent logo are acceptable, if CKEditor is ever reconsidered.

**CodeMirror 6 (owner-named, wrong layer).**
- **What it is:** a plain-text code editor.
- **Possible use:** a code-block component inside ProseMirror. ProseMirror has an official CodeMirror node view example; ProseKit has no first-party integration, so we would write a small node view.
- **Cost:** about 89 kB minified and gzipped plus each language.
- **Value:** only if code blocks need editor-grade features such as auto-indent or bracket matching, beyond the Shiki highlighting we already have.

## 4. Rejected

| Candidate | Category | Reason |
|---|---|---|
| Remirror | Fails `react-19`; at-risk | Its React peer stops at 18, issue #2309 is open, and the last release was 2025-08-02. |
| BlockNote | Down-ranked | Its block model (`blockContainer`/`blockGroup`) cannot load our ProseMirror JSON, so every note would need converting. Pre-1.0. |
| Milkdown | Down-ranked | It is Markdown-first, with different node names and no underline mark. |
| Plate, Lexical | Down-ranked | They are not ProseMirror, so a full rewrite and data conversion. Plate is mid-fork. Lexical is pre-1.0 and lacks a first-party image node. |
| Screened quickly | | **Quill 2:** fails recency. **Editor.js:** block JSON, not ProseMirror. **Slate (raw):** low-level. **Novel, Yoopta:** stale. **Mantine RTE:** a Tiptap wrapper. **TinyMCE 8:** GPL with a mandatory key, HTML model. **Froala:** proprietary. |

## 5. Recommendation and risks

**Recommendation.** Keep ProseKit. Do not migrate.
- Before R9 (rich text, checklists and the phone formatting bar), spend about an hour on a ProseKit mobile check. Reproduce ProseKit #1743 and the ProseMirror-level iOS and Android issues on R9's test devices.
- If ProseKit stalls, switch to Tiptap. A stall here means no release for 90 days, or its maintainer leaves.

**Risks:**
- **ProseKit bus factor.** *Mitigation:* pin minor versions, track releases, and keep the Tiptap node-name map ready.
- **ProseMirror bus factor.** It is shared by every ProseMirror option, so switching toolkits does not reduce it. *Mitigation:* none needed beyond pinning; ProseMirror has been stable for years.
- **Mobile IME bugs.** These are mostly ProseMirror-level. *Mitigation:* R9's physical-device check is already in the roadmap.

**Stated bias.** Mobile reliability, checklists, uploads and a JSON schema the server can validate weigh most, because R9–R11 depend on them. Collaboration weighs least, because the scope is one owner. Migration cost counts against every switch.

## 6. Sources and method

Primary sources and verification records for each candidate are in [data/findings/](data/findings/).

Key sources:
- [ProseKit](https://github.com/prosekit/prosekit)
- [Tiptap](https://github.com/ueberdosis/tiptap), [Tiptap UI components docs](https://github.com/ueberdosis/tiptap-docs)
- [CKEditor 5 `editor.ts`](https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-core/src/editor/editor.ts), [CKEditor 5 license](https://github.com/ckeditor/ckeditor5/blob/master/LICENSE.md)
- [BlockNote](https://github.com/TypeCellOS/BlockNote), [Lexical](https://github.com/facebook/lexical), [Plate](https://github.com/udecode/plate), [Milkdown](https://github.com/Milkdown/milkdown)
- [CodeMirror moved notice](https://github.com/codemirror/dev)

Method:
- Maturity is measured from 2026-05-21 to 2026-11-21, using the GitHub API and npm downloads.
- A verdict is "no" only when the docs state it or the design excludes it. Silence is "not documented".
- Checks by absence (no Markdown serializer, no underline mark, no Lexical image node) covered default branches only.
