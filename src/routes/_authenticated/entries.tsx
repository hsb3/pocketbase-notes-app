import { createFileRoute } from "@tanstack/react-router";
import { parseSearch, listEntries } from "@/features/entries/data";
import {
  Workspace,
  WorkspaceError,
  WorkspacePending,
} from "@/features/entries/workspace";
export const Route = createFileRoute("/_authenticated/entries")({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listEntries(deps),
  component: Workspace,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
});
