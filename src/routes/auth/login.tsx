import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginForm } from "@/components/interfaces/auth/auth";

export const Route = createFileRoute("/auth/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.isAuthenticated)
      throw search.redirect
        ? redirect({ href: search.redirect })
        : redirect({ to: "/" });
  },
});

function LoginPage() {
  const { redirect } = Route.useSearch();

  return (
    <div className="flex h-svh w-full items-center justify-center">
      <div className="max-w-sm flex-1">
        <LoginForm redirect={redirect} />
      </div>
    </div>
  );
}
