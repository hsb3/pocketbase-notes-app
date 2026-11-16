"use client";

import type { BasicExtension } from "prosekit/basic";
import type { Union } from "prosekit/core";
import type { MentionExtension } from "prosekit/extensions/mention";
import { useEditor } from "prosekit/react";
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompletePopup,
  AutocompletePositioner,
  AutocompleteRoot,
} from "prosekit/react/autocomplete";

const regex = /#[\da-z]*$/i;

export default function TagMenu(props: {
  tags: { id: number; label: string }[];
}) {
  const editor = useEditor<Union<[MentionExtension, BasicExtension]>>();

  const handleTagInsert = (id: number, label: string) => {
    editor.commands.insertMention({
      id: id.toString(),
      value: "#" + label,
      kind: "tag",
    });
    editor.commands.insertText({ text: " " });
  };

  return (
    <AutocompleteRoot regex={regex}>
      <AutocompletePositioner className="z-50 block h-min w-min overflow-visible transition-transform duration-100 ease-out motion-reduce:transition-none">
        <AutocompletePopup className="relative box-border flex max-h-100 min-h-0 min-w-60 origin-(--transform-origin) flex-col overflow-hidden rounded-xl border border-gray-200 bg-[canvas] whitespace-nowrap shadow-lg transition-[opacity,scale] transition-discrete duration-40 select-none data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=closed]:duration-150 motion-reduce:transition-none dark:border-gray-800 starting:scale-95 starting:opacity-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-[canvas] p-1">
            <AutocompleteEmpty className="relative box-border flex min-w-32 cursor-default scroll-my-1 items-center justify-between rounded-md px-3 py-1.5 text-sm whitespace-nowrap outline-hidden select-none data-highlighted:bg-gray-100 dark:data-highlighted:bg-gray-800">
              No results
            </AutocompleteEmpty>

            {props.tags.map((tag) => (
              <AutocompleteItem
                key={tag.id}
                className="relative box-border flex min-w-32 cursor-default scroll-my-1 items-center justify-between rounded-md px-3 py-1.5 text-sm whitespace-nowrap outline-hidden select-none data-highlighted:bg-gray-100 dark:data-highlighted:bg-gray-800"
                onSelect={() => handleTagInsert(tag.id, tag.label)}
              >
                #{tag.label}
              </AutocompleteItem>
            ))}
          </div>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  );
}
