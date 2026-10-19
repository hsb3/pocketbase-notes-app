import { createContext, useEffect, useState, type CSSProperties } from "react";
import {
  Outlet,
  Link,
  useLocation,
  getRouteApi,
  useRouter,
} from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
export const entriesRoute = getRouteApi("/_authenticated/entries");
export const WritingFocus = createContext<{
  focused: boolean;
  toggle: () => void;
} | null>(null);

export function Workspace() {
  const search = entriesRoute.useSearch();
  const path = useLocation({ select: (location) => location.pathname });
  const hasEditor = path !== "/entries" && path !== "/entries/";
  const [open, setOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const focused = focusMode && hasEditor;
  useEffect(() => {
    if (!hasEditor) setFocusMode(false);
  }, [hasEditor]);
  const title = {
    all: "All entries",
    note: "Notes",
    journal: "Journal",
    favorites: "Favorites",
  }[search.view];
  return (
    <WritingFocus.Provider
      value={{ focused, toggle: () => setFocusMode((value) => !value) }}
    >
      <SidebarProvider
        open={focused ? false : open}
        onOpenChange={setOpen}
        style={{ "--sidebar-width": "360px" } as CSSProperties}
      >
        <AppSidebar focused={focused} />
        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          {!hasEditor && (
            <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b bg-background p-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink asChild>
                      <Link
                        to="/entries"
                        search={{ ...search, view: "all", page: 1 }}
                      >
                        PocketBase Notes
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>
          )}
          <div className="entry-pane min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </WritingFocus.Provider>
  );
}

export function BlankPage() {
  const search = entriesRoute.useSearch();
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>Start a page of your own</EmptyTitle>
        <EmptyDescription>
          Open an entry from the sidebar, or start with something new.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/entries/new" search={{ ...search, view: "note" }}>
              New note
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/entries/new" search={{ ...search, view: "journal" }}>
              New journal entry
            </Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}
export function WorkspacePending() {
  return (
    <div className="flex flex-col gap-5 p-10" aria-label="Loading entries">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
export function WorkspaceError({ error }: { error: Error }) {
  const router = useRouter();
  const missing = "status" in error && error.status === 404;
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>
          {missing ? "Entry unavailable" : "Could not load entries"}
        </EmptyTitle>
        <EmptyDescription>
          {missing
            ? "This entry may have been removed or is not accessible."
            : "Check the connection and try again."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => router.invalidate()}>Retry</Button>
        <Button variant="outline" asChild>
          <Link
            to="/entries"
            search={{ view: "all", q: "", date: "", page: 1 }}
          >
            Back to entries
          </Link>
        </Button>
        <Button variant="link" asChild>
          <Link to="/auth/login">Sign in</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
