import { defineBasicExtension } from "prosekit/basic";
import { union, defineNodeSpec } from "prosekit/core";
import { defineCodeBlockShiki } from "prosekit/extensions/code-block";
import { defineHorizontalRule } from "prosekit/extensions/horizontal-rule";
import { defineImageUploadHandler } from "prosekit/extensions/image";
import { defineMath } from "prosekit/extensions/math";
import { defineMention } from "prosekit/extensions/mention";
import { definePlaceholder } from "prosekit/extensions/placeholder";

import {
  renderKaTeXMathBlock,
  renderKaTeXMathInline,
} from "../../sample/katex.ts";
import type { Uploader } from "prosekit/extensions/file";
import { defineCodeBlockView } from "../../ui/code-block-view/index.ts";
import { defineImageView } from "../../ui/image-view/index.ts";

export function defineExtension(uploader: Uploader<string>) {
  return union(
    defineBasicExtension(),
    // Private references are resolved by ImageView, never requested as browser URLs.
    defineNodeSpec({
      name: "image",
      toDOM(node) {
        const { src, ...attrs } = node.attrs;
        return typeof src === "string" && src.startsWith("attachment:")
          ? ["img", { ...attrs, "data-attachment": src }]
          : ["img", node.attrs];
      },
      parseDOM: [
        {
          tag: "img[data-attachment]",
          getAttrs(element) {
            return {
              src: element.getAttribute("data-attachment"),
              width: Number(element.getAttribute("width")) || null,
              height: Number(element.getAttribute("height")) || null,
            };
          },
        },
      ],
    }),
    definePlaceholder({ placeholder: "Press / for commands..." }),
    defineMention(),
    defineMath({
      renderMathBlock: renderKaTeXMathBlock,
      renderMathInline: renderKaTeXMathInline,
    }),
    defineCodeBlockShiki(),
    defineHorizontalRule(),
    defineCodeBlockView(),
    defineImageView(),
    defineImageUploadHandler({
      uploader,
    }),
  );
}

export type EditorExtension = ReturnType<typeof defineExtension>;
