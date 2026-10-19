import { createFileRoute } from "@tanstack/react-router";
import { BlankPage } from "@/features/entries/workspace";
export const Route = createFileRoute("/_authenticated/entries/")({
  component: BlankPage,
});
