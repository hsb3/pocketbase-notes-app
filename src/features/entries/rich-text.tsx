import "prosekit/basic/style.css";
import {
  createEditor,
  union,
  defineBaseCommands,
  defineBaseKeymap,
  defineHistory,
  defineUpdateHandler,
  type NodeJSON,
} from "prosekit/core";
import { defineDoc } from "prosekit/extensions/doc";
import { defineParagraph } from "prosekit/extensions/paragraph";
import { defineText } from "prosekit/extensions/text";
import { defineHeading } from "prosekit/extensions/heading";
import { defineBlockquote } from "prosekit/extensions/blockquote";
import { defineBold } from "prosekit/extensions/bold";
import { defineItalic } from "prosekit/extensions/italic";
import { defineHardBreak } from "prosekit/extensions/hard-break";
import { defineReadonly } from "prosekit/extensions/readonly";
import { ProseKit } from "prosekit/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  IconBold,
  IconItalic,
  IconH2,
  IconBlockquote,
} from "@tabler/icons-react";

// Adapted from @prosekit/react-example-minimal; keep the schema aligned with backend validation.
export function RichText({
  initialBody,
  disabled,
  onChange,
}: {
  initialBody: NodeJSON;
  disabled: boolean;
  onChange: (body: NodeJSON) => void;
}) {
  const callback = useRef(onChange);
  callback.current = onChange;
  const [active, setActive] = useState<string[]>([]);
  const [initial] = useState(initialBody);
  const editor = useMemo(
    () =>
      createEditor({
        extension: union(
          defineDoc(),
          defineParagraph(),
          defineText(),
          defineHeading(),
          defineBlockquote(),
          defineBold(),
          defineItalic(),
          defineHardBreak(),
          defineBaseCommands(),
          defineBaseKeymap(),
          defineHistory(),
        ),
        defaultContent: initial,
      }),
    [initial],
  );
  useEffect(
    () =>
      editor.use(
        defineUpdateHandler((view, previous) => {
          if (!view.state.doc.eq(previous.doc))
            callback.current(editor.getDocJSON());
          setActive(
            [
              editor.marks.bold.isActive() ? "bold" : "",
              editor.marks.italic.isActive() ? "italic" : "",
              editor.nodes.heading.isActive({ level: 2 }) ? "heading" : "",
              editor.nodes.blockquote.isActive() ? "quote" : "",
            ].filter(Boolean),
          );
        }),
      ),
    [editor],
  );
  useEffect(
    () => (disabled ? editor.use(defineReadonly()) : undefined),
    [editor, disabled],
  );
  const tools = [
    {
      key: "bold",
      label: "Bold",
      icon: IconBold,
      run: () => editor.commands.toggleBold(),
    },
    {
      key: "italic",
      label: "Italic",
      icon: IconItalic,
      run: () => editor.commands.toggleItalic(),
    },
    {
      key: "heading",
      label: "Heading",
      icon: IconH2,
      run: () => editor.commands.toggleHeading({ level: 2 }),
    },
    {
      key: "quote",
      label: "Blockquote",
      icon: IconBlockquote,
      run: () => editor.commands.toggleBlockquote(),
    },
  ];
  return (
    <ProseKit editor={editor}>
      <div className="editor-toolbar">
        <ToggleGroup
          type="multiple"
          value={active}
          disabled={disabled}
          aria-label="Text formatting"
        >
          {tools.map((tool) => (
            <ToggleGroupItem
              key={tool.key}
              value={tool.key}
              aria-label={tool.label}
              title={tool.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                tool.run();
                editor.focus();
              }}
            >
              <tool.icon />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div
        className="writing-body"
        ref={editor.mount}
        role="textbox"
        aria-label="Entry body"
        aria-multiline="true"
      />
    </ProseKit>
  );
}
