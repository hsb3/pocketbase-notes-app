# Adopted prebuilt UI

The current workspace reuses shadcn primitives and the ProseKit editor schema. The selection notes below record the original entries interface. See [folders, note editing and historical source](../features/notes.md).

## Findings

| Source | Reusable surface | Decision |
| --- | --- | --- |
| [shadcn sidebar-09](https://ui.shadcn.com/blocks/sidebar#sidebar-09) | Nested icon rail and list, collapsible sidebar, user dropdown, header composition | Selected; maps directly to library navigation and entries |
| [shadcn sidebar-12](https://ui.shadcn.com/blocks/sidebar#sidebar-12) | Calendar-oriented sidebar | Registry discovery only; less directly suited to the main entry list |
| [ProseKit full example](https://prosekit.dev/r/react-example-full.json) | Full editor, inline/slash menus, formatting, code/math, tables and image handling | Selected; keeps the installed editor engine and document format |
| [Plate basic editor](https://platejs.org/docs/installation/react) | Assembled React/Vite editor block | Viable alternative, but changes the editor engine and document format |
| [BlockNote shadcn](https://www.blocknotejs.org/docs/getting-started/shadcn) | Turnkey block editor with menus and dragging | Broader feature set and different editor engine; core MPL-2.0, XL licensing differs |
| [Tiptap Simple Editor](https://tiptap.dev/docs/ui-components/templates/simple-editor) | Full responsive editor template | Viable MIT template; unnecessary engine change for this experiment |

The alternatives were checked through registry metadata and primary documentation. Only the
selected shadcn/ProseKit combination was installed and exercised in this project. This is a
focused reuse comparison, not a benchmark of the other editors.

## What came from blocks

The original sidebar used shadcn’s `sidebar-09` block. The current folder pane lives in `src/features/folders/` and its account menu uses `src/components/nav-user.tsx`. The note list, route workspace and autosave logic live in `src/features/notes/`.

The editor uses `src/components/editor/examples/full/` and `src/components/editor/ui/`. It can reopen stored rich content and protected images. Formatting and upload controls are deferred. The [attachment contract](../features/attachments.md) describes file handling.

## Checks

The [verification guide](../testing/verification.md) covers Compose, autosave, private reads, keyboard focus and responsive navigation.

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
