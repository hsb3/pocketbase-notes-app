import "prosekit/basic/style.css";

import {
  createEditor,
  defineUpdateHandler,
  type NodeJSON,
} from "prosekit/core";
import { defineReadonly } from "prosekit/extensions/readonly";
import { ProseKit } from "prosekit/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { defineExtension } from "./extension.ts";

interface EditorProps {
  initialBody?: NodeJSON;
  disabled?: boolean;
  onChange: (body: NodeJSON) => void;
}

export default function Editor(props: EditorProps) {
  const [initial] = useState(props.initialBody);
  const callback = useRef(props.onChange);
  callback.current = props.onChange;
  const editor = useMemo(
    () =>
      createEditor({
        extension: defineExtension(),
        defaultContent: initial,
      }),
    [initial],
  );
  useLayoutEffect(
    () =>
      editor.use(
        defineUpdateHandler((view, previous) => {
          if (!view.state.doc.eq(previous.doc))
            callback.current(editor.getDocJSON());
        }),
      ),
    [editor],
  );
  useLayoutEffect(
    () => (props.disabled ? editor.use(defineReadonly()) : undefined),
    [editor, props.disabled],
  );
  useLayoutEffect(() => {
    editor.focus();
  }, [editor]);

  return (
    <ProseKit editor={editor}>
      <div
        ref={editor.mount}
        role="textbox"
        aria-label="Note"
        aria-multiline="true"
        className="ProseMirror box-border min-h-[45svh] min-w-0 px-4 py-3 leading-7 wrap-anywhere text-foreground outline-0 sm:px-5 [&_blockquote]:border-l [&_blockquote]:pl-4 [&_blockquote]:italic [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_h3]:font-semibold [&_p]:my-3 [&_pre]:overflow-x-auto [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&>p:first-child]:text-3xl [&>p:first-child]:font-semibold"
      />
    </ProseKit>
  );
}
