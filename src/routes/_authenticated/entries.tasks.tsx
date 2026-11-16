import { createFileRoute } from "@tanstack/react-router";
import { listOpenTasks } from "@/features/tasks/data";
import { OpenTasks } from "@/features/tasks/open-tasks";
import { WorkspaceError, WorkspacePending } from "@/features/entries/workspace";
export const Route = createFileRoute("/_authenticated/entries/tasks")({
  loader: () => listOpenTasks(),
  component: Page,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
});
function Page() {
  return <OpenTasks entries={Route.useLoaderData()} />;
}
