import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (!context.isAuthenticated) throw redirect({ to: "/auth/login" });
    throw redirect({ to: "/folders/$folderId", params: { folderId: "all" } });
  },
});
