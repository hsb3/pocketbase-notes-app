"use client";

import type { BasicExtension } from "prosekit/basic";
import type { Editor } from "prosekit/core";
import type { LinkAttrs } from "prosekit/extensions/link";
import type { EditorState } from "prosekit/pm/state";
import { useEditor, useEditorDerivedValue } from "prosekit/react";
import {
  InlinePopoverPopup,
  InlinePopoverPositioner,
  InlinePopoverRoot,
} from "prosekit/react/inline-popover";
import { useState } from "react";

import { Button } from "../button/index.ts";

function getInlineMenuItems(editor: Editor<BasicExtension>) {
  return {
    bold: editor.commands.toggleBold
      ? {
          isActive: editor.marks.bold.isActive(),
          canExec: editor.commands.toggleBold.canExec(),
          command: () => editor.commands.toggleBold(),
        }
      : undefined,
    italic: editor.commands.toggleItalic
      ? {
          isActive: editor.marks.italic.isActive(),
          canExec: editor.commands.toggleItalic.canExec(),
          command: () => editor.commands.toggleItalic(),
        }
      : undefined,
    underline: editor.commands.toggleUnderline
      ? {
          isActive: editor.marks.underline.isActive(),
          canExec: editor.commands.toggleUnderline.canExec(),
          command: () => editor.commands.toggleUnderline(),
        }
      : undefined,
    strike: editor.commands.toggleStrike
      ? {
          isActive: editor.marks.strike.isActive(),
          canExec: editor.commands.toggleStrike.canExec(),
          command: () => editor.commands.toggleStrike(),
        }
      : undefined,
    code: editor.commands.toggleCode
      ? {
          isActive: editor.marks.code.isActive(),
          canExec: editor.commands.toggleCode.canExec(),
          command: () => editor.commands.toggleCode(),
        }
      : undefined,
    link: editor.commands.addLink
      ? {
          isActive: editor.marks.link.isActive(),
          canExec: editor.commands.addLink.canExec({ href: "" }),
          command: () => editor.commands.expandLink(),
          currentLink: getCurrentLink(editor.state) || "",
        }
      : undefined,
  };
}

function getCurrentLink(state: EditorState): string | undefined {
  const { $from } = state.selection;
  const marks = $from.marksAcross($from);
  if (!marks) {
    return;
  }
  for (const mark of marks) {
    if (mark.type.name === "link") {
      return (mark.attrs as LinkAttrs).href;
    }
  }
}

export default function InlineMenu() {
  const editor = useEditor<BasicExtension>();
  const items = useEditorDerivedValue(getInlineMenuItems);

  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const toggleLinkMenuOpen = () => setLinkMenuOpen((open) => !open);

  const handleLinkUpdate = (href?: string) => {
    if (href) {
      editor.commands.addLink({ href });
    } else {
      editor.commands.removeLink();
    }

    setLinkMenuOpen(false);
    editor.focus();
  };

  return (
    <>
      <InlinePopoverRoot
        onOpenChange={(event) => {
          if (!event.detail) {
            setLinkMenuOpen(false);
          }
        }}
      >
        <InlinePopoverPositioner className="z-50 block h-min w-min overflow-visible transition-transform duration-100 ease-out motion-reduce:transition-none">
          <InlinePopoverPopup
            data-testid="inline-menu-main"
            className="relative box-border flex min-w-32 origin-(--transform-origin) space-x-1 overflow-auto rounded-lg border border-gray-200 bg-[canvas] p-1 whitespace-nowrap shadow-lg transition-[opacity,scale] transition-discrete duration-40 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=closed]:duration-150 motion-reduce:transition-none dark:border-gray-800 starting:scale-95 starting:opacity-0"
          >
            {items.bold && (
              <Button
                pressed={items.bold.isActive}
                disabled={!items.bold.canExec}
                onClick={items.bold.command}
                tooltip="Bold"
              >
                <div className="i-lucide-bold block size-5"></div>
              </Button>
            )}
            {items.italic && (
              <Button
                pressed={items.italic.isActive}
                disabled={!items.italic.canExec}
                onClick={items.italic.command}
                tooltip="Italic"
              >
                <div className="i-lucide-italic block size-5"></div>
              </Button>
            )}
            {items.underline && (
              <Button
                pressed={items.underline.isActive}
                disabled={!items.underline.canExec}
                onClick={items.underline.command}
                tooltip="Underline"
              >
                <div className="i-lucide-underline block size-5"></div>
              </Button>
            )}
            {items.strike && (
              <Button
                pressed={items.strike.isActive}
                disabled={!items.strike.canExec}
                onClick={items.strike.command}
                tooltip="Strikethrough"
              >
                <div className="i-lucide-strikethrough block size-5"></div>
              </Button>
            )}
            {items.code && (
              <Button
                pressed={items.code.isActive}
                disabled={!items.code.canExec}
                onClick={items.code.command}
                tooltip="Code"
              >
                <div className="i-lucide-code block size-5"></div>
              </Button>
            )}
            {items.link && items.link.canExec && (
              <Button
                pressed={items.link.isActive}
                onClick={() => {
                  items.link?.command?.();
                  toggleLinkMenuOpen();
                }}
                tooltip="Link"
              >
                <div className="i-lucide-link block size-5"></div>
              </Button>
            )}
          </InlinePopoverPopup>
        </InlinePopoverPositioner>
      </InlinePopoverRoot>

      {items.link && (
        <InlinePopoverRoot
          defaultOpen={false}
          open={linkMenuOpen}
          onOpenChange={(event) => setLinkMenuOpen(event.detail)}
        >
          <InlinePopoverPositioner
            placement="bottom"
            className="z-50 block h-min w-min overflow-visible transition-transform duration-100 ease-out motion-reduce:transition-none"
          >
            <InlinePopoverPopup
              data-testid="inline-menu-link"
              className="relative box-border flex w-xs origin-(--transform-origin) flex-col items-stretch gap-y-2 rounded-lg border border-gray-200 bg-[canvas] p-4 shadow-lg transition-[opacity,scale] transition-discrete duration-40 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=closed]:duration-150 motion-reduce:transition-none dark:border-gray-800 starting:scale-95 starting:opacity-0"
            >
              {linkMenuOpen && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const target = event.target as HTMLFormElement | null;
                    const href = target?.querySelector("input")?.value?.trim();
                    handleLinkUpdate(href);
                  }}
                >
                  <input
                    placeholder="Paste the link..."
                    defaultValue={items.link.currentLink}
                    className="box-border flex h-9 w-full rounded-md border border-solid border-gray-200 bg-[canvas] px-3 py-2 text-sm ring-0 ring-transparent outline-hidden transition file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-0 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:placeholder:text-gray-500 dark:focus-visible:ring-gray-300"
                  />
                </form>
              )}
              {items.link.isActive && (
                <button
                  onClick={() => handleLinkUpdate()}
                  onMouseDown={(event) => event.preventDefault()}
                  className="inline-flex h-9 items-center justify-center rounded-md border-0 bg-gray-900 px-3 text-sm font-medium whitespace-nowrap text-gray-50 ring-offset-white transition-colors hover:bg-gray-900/90 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:ring-offset-gray-950 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
                >
                  Remove link
                </button>
              )}
            </InlinePopoverPopup>
          </InlinePopoverPositioner>
        </InlinePopoverRoot>
      )}
    </>
  );
}
