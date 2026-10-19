"use client";

import "prosekit/basic/style.css";

import {
  createEditor,
  defineUpdateHandler,
  type NodeJSON,
} from "prosekit/core";
import { defineReadonly } from "prosekit/extensions/readonly";
import { ProseKit } from "prosekit/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Toolbar } from "../../ui/toolbar/index.ts";

import { defineExtension } from "./extension.ts";

export default function Editor({
  initialBody,
  disabled,
  onChange,
}: {
  initialBody: NodeJSON;
  disabled: boolean;
  onChange: (body: NodeJSON) => void;
}) {
  const [initial] = useState(initialBody);
  const callback = useRef(onChange);
  callback.current = onChange;
  const editor = useMemo(() => {
    const extension = defineExtension();
    return createEditor({ extension, defaultContent: initial });
  }, [initial]);

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
    () => (disabled ? editor.use(defineReadonly()) : undefined),
    [editor, disabled],
  );

  return (
    <ProseKit editor={editor}>
      <div className="box-border flex h-full min-h-36 w-full flex-col overflow-x-hidden overflow-y-hidden rounded-md border border-border border-solid bg-background text-foreground">
        <div inert={disabled}>
          <Toolbar />
        </div>
        <div className="relative box-border w-full flex-1 overflow-y-auto">
          <div
            ref={editor.mount}
            role="textbox"
            aria-label="Entry body"
            aria-multiline="true"
            className="ProseMirror box-border min-h-[45svh] px-4 py-3 leading-7 outline-0 outline-hidden sm:px-5 [&_blockquote]:border-l [&_blockquote]:pl-4 [&_blockquote]:italic [&_h1]:font-semibold [&_h1]:text-3xl [&_h2]:font-semibold [&_h2]:text-2xl [&_h3]:font-semibold [&_h3]:text-xl [&_p]:my-3"
          ></div>
        </div>
      </div>
    </ProseKit>
  );
}
