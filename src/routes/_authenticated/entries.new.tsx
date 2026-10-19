import { createFileRoute } from "@tanstack/react-router";
import { EntryEditor } from "@/features/entries/entry-editor";
export const Route = createFileRoute("/_authenticated/entries/new")({
  component: () => <EntryEditor />,
});
