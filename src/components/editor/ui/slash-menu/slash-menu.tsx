"use client";

import type { BasicExtension } from "prosekit/basic";
import { canUseRegexLookbehind } from "prosekit/core";
import { useEditor } from "prosekit/react";
import {
  AutocompletePopup,
  AutocompletePositioner,
  AutocompleteRoot,
} from "prosekit/react/autocomplete";

import SlashMenuEmpty from "./slash-menu-empty.tsx";
import SlashMenuItem from "./slash-menu-item.tsx";

// Match inputs like "/", "/table", "/heading 1" etc. Do not match "/ heading".
const regex = new RegExp(
  (canUseRegexLookbehind() ? String.raw`(?<!\S)` : "") + String.raw`\/(\S.*)?$`,
  "u",
);

export default function SlashMenu() {
  const editor = useEditor<BasicExtension>();

  return (
    <AutocompleteRoot regex={regex}>
      <AutocompletePositioner className="z-50 block h-min w-min overflow-visible transition-transform duration-100 ease-out motion-reduce:transition-none">
        <AutocompletePopup className="relative box-border flex max-h-100 min-h-0 min-w-60 origin-(--transform-origin) starting:scale-95 select-none flex-col overflow-hidden whitespace-nowrap rounded-xl border border-gray-200 bg-[canvas] starting:opacity-0 shadow-lg transition-[opacity,scale] transition-discrete duration-40 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=closed]:duration-150 motion-reduce:transition-none dark:border-gray-800">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-[canvas] p-1">
            <SlashMenuItem
              label="Text"
              onSelect={() => editor.commands.setParagraph()}
            />

            <SlashMenuItem
              label="Heading 1"
              kbd="#"
              onSelect={() => editor.commands.setHeading({ level: 1 })}
            />

            <SlashMenuItem
              label="Heading 2"
              kbd="##"
              onSelect={() => editor.commands.setHeading({ level: 2 })}
            />

            <SlashMenuItem
              label="Heading 3"
              kbd="###"
              onSelect={() => editor.commands.setHeading({ level: 3 })}
            />

            <SlashMenuItem
              label="Bullet list"
              kbd="-"
              onSelect={() => editor.commands.wrapInList({ kind: "bullet" })}
            />

            <SlashMenuItem
              label="Ordered list"
              kbd="1."
              onSelect={() => editor.commands.wrapInList({ kind: "ordered" })}
            />

            <SlashMenuItem
              label="Task list"
              kbd="[]"
              onSelect={() => editor.commands.wrapInList({ kind: "task" })}
            />

            <SlashMenuItem
              label="Toggle list"
              kbd=">>"
              onSelect={() => editor.commands.wrapInList({ kind: "toggle" })}
            />

            <SlashMenuItem
              label="Quote"
              kbd=">"
              onSelect={() => editor.commands.setBlockquote()}
            />

            <SlashMenuItem
              label="Table"
              onSelect={() => editor.commands.insertTable({ row: 3, col: 3 })}
            />

            <SlashMenuItem
              label="Divider"
              kbd="---"
              onSelect={() => editor.commands.insertHorizontalRule()}
            />

            <SlashMenuItem
              label="Code"
              kbd="```"
              onSelect={() => editor.commands.setCodeBlock()}
            />

            <SlashMenuEmpty />
          </div>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  );
}
