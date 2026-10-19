import { createFileRoute } from "@tanstack/react-router";
import { getEntry } from "@/features/entries/data";
import { EntryEditor } from "@/features/entries/entry-editor";
import { WorkspaceError, WorkspacePending } from "@/features/entries/workspace";
export const Route = createFileRoute("/_authenticated/entries/$entryId")({
  loader: ({ params }) => getEntry(params.entryId),
  component: Page,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
});
function Page() {
  const entry = Route.useLoaderData();
  return <EntryEditor key={entry.id} entry={entry} />;
}
