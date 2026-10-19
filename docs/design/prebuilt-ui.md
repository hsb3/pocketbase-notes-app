# Adopted prebuilt UI

The prebuilt interface is the sole UI at `/entries`. The earlier implementation is
preserved only in Git checkpoint `7c91b47`; there is no UI switch or alternate editor.
Existing entries use the same schema and require no migration.

## Findings

| Source | Reusable surface | Decision |
| --- | --- | --- |
| [shadcn sidebar-09](https://ui.shadcn.com/blocks/sidebar#sidebar-09) | Nested icon rail and list, collapsible sidebar, user dropdown, header composition | Selected; maps directly to library navigation and entries |
| [shadcn sidebar-12](https://ui.shadcn.com/blocks/sidebar#sidebar-12) | Calendar-oriented sidebar | Registry discovery only; less directly suited to the main entry list |
| [ProseKit toolbar example](https://prosekit.dev/r/react-example-toolbar.json) | Editor shell plus command-aware toolbar, buttons, tooltips, undo/redo, heading actions | Selected; keeps the installed editor engine and document format |
| [Plate basic editor](https://platejs.org/docs/installation/react) | Assembled React/Vite editor block | Viable alternative, but changes the editor engine and document format |
| [BlockNote shadcn](https://www.blocknotejs.org/docs/getting-started/shadcn) | Turnkey block editor with menus and dragging | Broader feature set and different editor engine; core MPL-2.0, XL licensing differs |
| [Tiptap Simple Editor](https://tiptap.dev/docs/ui-components/templates/simple-editor) | Full responsive editor template | Viable MIT template; unnecessary engine change for this experiment |

The alternatives were checked through registry metadata and primary documentation. Only the
selected shadcn/ProseKit combination was installed and exercised in this project. This is a
focused reuse comparison, not a benchmark of the other editors.

## What came from blocks

- `src/components/app-sidebar.tsx` and `nav-user.tsx`: installed from `sidebar-09`.
  Retains its nested sidebar composition, icon navigation, list row layout and account dropdown.
  Sample email data became PocketBase entries; router links replace demo actions. Billing,
  upgrades and notifications were removed because the product does not support them.
- `src/features/entries/workspace.tsx`: the `sidebar-09` page composition, with the
  existing route outlet replacing placeholder rectangles. The breadcrumb header appears
  only in the library; an open entry uses one compact editor header to avoid duplicate controls.
- `src/components/editor/examples/toolbar/` and `src/components/editor/ui/`: installed
  from ProseKit's complete toolbar example, including its toolbar/button/tooltip behavior.
  Added initial JSON, change callbacks and read-only state to connect to existing persistence.
  Responsive content padding and semantic surface colors adapt the example to this app.
- The toolbar already checks available editor commands. The shared restricted schema naturally
  hides unsupported features. No fake sample uploader or attachment controls are enabled.

Save, validation, authentication recovery, conflict and deletion logic remains
in `EntryEditor`. These are application-specific behavior rather than registry features.
No backend schema or access rules changed for the second UI.

The ProseKit registry installs its icon CSS plugin and icon set; the shadcn block uses its
upstream Lucide icons. Application controls retain Tabler. These extra dependencies
are specific to keeping the prebuilt examples close to upstream. No preset or theme reset was run.

## Checks

The browser suite runs against `/entries` and checks editing round trips, saving,
journal dates, filtering, favorites, draft guards, conflicts, session recovery,
full-screen mode, sidebar collapse, mobile navigation, undo/redo and deletion.
API checks cover the unchanged backend.

## Source notices

Selected source licenses were read from their upstream repositories. Preserve these notices
with the adapted source. Third-party packages retain their own licenses.

### shadcn/ui

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### ProseKit

MIT License

Copyright (c) 2023 ocavue

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
