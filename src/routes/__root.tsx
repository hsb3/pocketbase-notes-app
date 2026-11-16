import { pb } from "@/services/pocketbase";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import {
  createRootRouteWithContext,
  Outlet,
  useLocation,
} from "@tanstack/react-router";

interface RouteContext {
  isAuthenticated: boolean;
}

export const Route = createRootRouteWithContext<RouteContext>()({
  component: Root,
  beforeLoad: () => {
    // Dev-only escape hatch: VITE_AUTH_BYPASS=true runs the frontend without a
    // backend. import.meta.env.DEV makes this dead code in production builds.
    const isAuthenticated =
      (import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === "true") ||
      pb.authStore.isValid;

    return { isAuthenticated: isAuthenticated };
  },
});

function Root() {
  /** signed-in screens reach the theme control through the user menu */
  const signedOut = useLocation({
    select: (location) => location.pathname.startsWith("/auth/"),
  });

  return (
    <>
      <Outlet />
      {signedOut && <ThemeToggle className="fixed top-3 right-3" />}
    </>
  );
}
