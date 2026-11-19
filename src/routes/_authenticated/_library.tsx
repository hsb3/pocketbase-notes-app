import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/features/notes/workspace";

export const Route = createFileRoute("/_authenticated/_library")({
  component: Workspace,
});
