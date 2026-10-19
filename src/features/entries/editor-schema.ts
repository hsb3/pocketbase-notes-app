import {
  union,
  defineBaseCommands,
  defineBaseKeymap,
  defineHistory,
} from "prosekit/core";
import { defineDoc } from "prosekit/extensions/doc";
import { defineParagraph } from "prosekit/extensions/paragraph";
import { defineText } from "prosekit/extensions/text";
import { defineHeading } from "prosekit/extensions/heading";
import { defineBlockquote } from "prosekit/extensions/blockquote";
import { defineBold } from "prosekit/extensions/bold";
import { defineItalic } from "prosekit/extensions/italic";
import { defineHardBreak } from "prosekit/extensions/hard-break";

export function defineEntryExtension() {
  return union(
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
  );
}
