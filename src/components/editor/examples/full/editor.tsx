import "prosekit/basic/style.css";

import {
  createEditor,
  defineUpdateHandler,
  type NodeJSON,
} from "prosekit/core";
import { ProseKit } from "prosekit/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Uploader } from "prosekit/extensions/file";
import { defineReadonly } from "prosekit/extensions/readonly";

import { BlockHandle } from "../../ui/block-handle/index.ts";
import { DropIndicator } from "../../ui/drop-indicator/index.ts";
import { InlineMenu } from "../../ui/inline-menu/index.ts";
import { SlashMenu } from "../../ui/slash-menu/index.ts";
import { TableHandle } from "../../ui/table-handle/index.ts";
import { Toolbar } from "../../ui/toolbar/index.ts";

import { defineExtension } from "./extension.ts";

interface EditorProps {
  initialBody: NodeJSON;
  disabled: boolean;
  onChange: (body: NodeJSON) => void;
  uploader: Uploader<string>;
}

export default function Editor(props: EditorProps) {
  const [initial] = useState(props.initialBody);
  const callback = useRef(props.onChange);
  callback.current = props.onChange;
  const upload = useRef(props.uploader);
  upload.current = props.uploader;
  const editor = useMemo(
    () =>
      createEditor({
        extension: defineExtension((options) => upload.current(options)),
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
        }),
      ),
    [editor],
  );
  useEffect(
    () => (props.disabled ? editor.use(defineReadonly()) : undefined),
    [editor, props.disabled],
  );

  return (
    <ProseKit editor={editor}>
      <div className="box-border flex h-full min-h-36 w-full flex-col overflow-x-hidden overflow-y-hidden rounded-md border border-border border-solid bg-background text-foreground">
        <div inert={props.disabled}>
          <Toolbar uploader={props.uploader} />
        </div>
        <div className="relative box-border w-full flex-1 overflow-y-auto">
          <div
            ref={editor.mount}
            role="textbox"
            aria-label="Entry body"
            aria-multiline="true"
            className="ProseMirror box-border min-h-[45svh] px-4 py-3 leading-7 outline-0 outline-hidden sm:px-5 [&_blockquote]:border-l [&_blockquote]:pl-4 [&_blockquote]:italic [&_h1]:font-semibold [&_h1]:text-3xl [&_h2]:font-semibold [&_h2]:text-2xl [&_h3]:font-semibold [&_h3]:text-xl [&_p]:my-3 [&_pre]:overflow-x-auto [&_span[data-mention=tag]]:text-violet-500 [&_span[data-mention=user]]:text-blue-500 [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2"
          ></div>
          <InlineMenu />
          <SlashMenu />
          <BlockHandle />
          <TableHandle />
          <DropIndicator />
        </div>
      </div>
    </ProseKit>
  );
}
