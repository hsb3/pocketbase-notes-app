import { defineEntryExtension } from "@/features/entries/editor-schema";

export const defineExtension = defineEntryExtension;
export type EditorExtension = ReturnType<typeof defineExtension>;
