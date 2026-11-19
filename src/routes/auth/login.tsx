import { useEffect } from "react";
import { pb } from "@/services/pocketbase";
import { hasHeldDraft } from "@/features/notes/suspended-draft";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { LoginForm } from "@/features/auth/auth";

export const Route = createFileRoute("/auth/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect:
      typeof search.redirect === "string" &&
      /^\/(?!\/)/.test(search.redirect) &&
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject URL parser whitespace/control normalization.
      !/[\\\u0000-\u0020\u007f]/.test(search.redirect)
        ? search.redirect
        : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.isAuthenticated)
      throw search.redirect && !hasHeldDraft()
        ? redirect({ href: search.redirect })
        : redirect({ to: "/" });
  },
});

function LoginPage() {
  const { redirect } = Route.useSearch();

  const navigate = useNavigate();
  useEffect(() => {
    function signedInElsewhere() {
      if (
        pb.authStore.isValid &&
        pb.authStore.record?.collectionName === "users"
      )
        void navigate({ to: "/", replace: true });
    }
    window.addEventListener("storage", signedInElsewhere);
    return () => window.removeEventListener("storage", signedInElsewhere);
  }, [navigate]);

  return (
    <div className="flex h-svh w-full items-center justify-center">
      <div className="max-w-sm flex-1">
        <LoginForm redirect={hasHeldDraft() ? undefined : redirect} />
      </div>
    </div>
  );
}
