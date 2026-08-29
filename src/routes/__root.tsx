import { pb } from "@/services/pocketbase";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

interface RouteContext {
  isAuthenticated: boolean;
}

export const Route = createRootRouteWithContext<RouteContext>()({
  component: Outlet,
  beforeLoad: () => {
    // Dev-only escape hatch: VITE_AUTH_BYPASS=true runs the frontend without a
    // backend. import.meta.env.DEV makes this dead code in production builds.
    const isAuthenticated =
      (import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === "true") ||
      pb.authStore.isValid;

    return { isAuthenticated: isAuthenticated };
  },
});
