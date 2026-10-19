import {
  getRouteApi,
  Link,
  Outlet,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { createContext, useEffect, useState, type CSSProperties } from "react";
import {
  IconBook2,
  IconNotebook,
  IconNotes,
  IconStar,
  IconPlus,
  IconLogout,
  IconSearch,
  IconArrowLeft,
  IconArrowRight,
  IconPencil,
} from "@tabler/icons-react";
import { pb } from "@/services/pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { DatePicker } from "./date-picker";
import { bodyText, type View } from "./data";

export const WritingFocus = createContext<{
  focused: boolean;
  toggle: () => void;
} | null>(null);

export const entriesRoute = getRouteApi("/_authenticated/entries");
const views = [
  { key: "all", label: "All entries", icon: IconNotebook },
  { key: "note", label: "Notes", icon: IconNotes },
  { key: "journal", label: "Journal", icon: IconBook2 },
  { key: "favorites", label: "Favorites", icon: IconStar },
] as const;
function Navigation() {
  const search = entriesRoute.useSearch();
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-5 py-7">
        <Link
          to="/entries"
          search={{ view: "all", q: "", date: "", page: 1 }}
          className="brand"
        >
          <IconBook2 />
          <span>Notebook</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {views.map((view) => (
              <SidebarMenuItem key={view.key}>
                <SidebarMenuButton asChild isActive={search.view === view.key}>
                  <Link
                    to="/entries"
                    search={{ view: view.key, q: "", date: "", page: 1 }}
                    onClick={() => setOpenMobile(false)}
                  >
                    <view.icon />
                    <span>{view.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 p-5">
        <div className="account-name">
          {pb.authStore.record?.name || "My notebook"}
          <small>Private workspace</small>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/auth/logout">
            <IconLogout data-icon="inline-start" />
            Log out
          </Link>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
export function Workspace() {
  const search = entriesRoute.useSearch();
  const result = entriesRoute.useLoaderData();
  const navigate = entriesRoute.useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const hasEditor = pathname !== "/entries" && pathname !== "/entries/";
  const [query, setQuery] = useState(search.q);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const focused = hasEditor && focusMode;
  useEffect(() => {
    if (!hasEditor) setFocusMode(false);
  }, [hasEditor]);
  useEffect(() => setQuery(search.q), [search.q]);
  const title =
    views.find((view) => view.key === search.view)?.label || "All entries";
  function filter(update: Partial<{ view: View; q: string; date: string }>) {
    void navigate({ search: { ...search, ...update, page: 1 } });
  }
  return (
    <WritingFocus.Provider
      value={{ focused, toggle: () => setFocusMode((value) => !value) }}
    >
      <SidebarProvider
        open={focused ? false : sidebarOpen}
        onOpenChange={setSidebarOpen}
        style={{ "--sidebar-width": "15rem" } as CSSProperties}
      >
        <Navigation />
        <SidebarInset>
          <div className={`notebook-layout ${focused ? "focus-mode" : ""}`}>
            <section
              className={`entry-list ${hasEditor ? "list-hidden-mobile" : ""}`}
              aria-label="Entries"
            >
              <div className="library-header">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1>{title}</h1>
                </div>
                <p>A little space for what's on your mind.</p>
                <form
                  className="search-field"
                  onSubmit={(event) => {
                    event.preventDefault();
                    filter({ q: query });
                  }}
                >
                  <IconSearch aria-hidden="true" />
                  <Input
                    aria-label="Search titles"
                    placeholder="Search titles…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <Button type="submit" variant="ghost" size="sm">
                    Search
                  </Button>
                </form>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild className="flex-1">
                    <Link to="/entries/new" search={search}>
                      <IconPlus data-icon="inline-start" />
                      {search.view === "journal"
                        ? "New journal entry"
                        : "New entry"}
                    </Link>
                  </Button>
                  {search.view === "journal" && (
                    <DatePicker
                      value={search.date}
                      onChange={(date) => filter({ date })}
                      clearable
                    />
                  )}
                </div>
              </div>
              <div className="entry-rows">
                {result.items.length ? (
                  result.items.map((entry) => (
                    <Link
                      key={entry.id}
                      to="/entries/$entryId"
                      params={{ entryId: entry.id }}
                      search={search}
                      className={`entry-row ${pathname.endsWith(`/${entry.id}`) ? "entry-selected" : ""}`}
                      aria-current={
                        pathname.endsWith(`/${entry.id}`) ? "page" : undefined
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2>{entry.title}</h2>
                        {entry.favorite && (
                          <IconStar
                            className="entry-star"
                            aria-label="Favorite"
                          />
                        )}
                      </div>
                      <p>{bodyText(entry.body)}</p>
                      <div className="entry-meta">
                        <Badge variant="outline">
                          {entry.kind === "journal" ? "Journal" : "Note"}
                        </Badge>
                        <time>
                          {entry.kind === "journal"
                            ? new Date(
                                `${entry.journal_date}T12:00:00`,
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })
                            : new Date(
                                entry.updated.replace(" ", "T"),
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                        </time>
                      </div>
                    </Link>
                  ))
                ) : (
                  <Empty className="px-4 py-12">
                    <EmptyHeader>
                      <EmptyTitle>
                        {search.q || search.date
                          ? "No matching entries"
                          : search.view === "favorites"
                            ? "Keep the good ones close"
                            : "A fresh page"}
                      </EmptyTitle>
                      <EmptyDescription>
                        {search.q || search.date
                          ? "Try another title or date."
                          : search.view === "favorites"
                            ? "Star an entry and save it to find it here."
                            : "Start with a thought, an idea, or a moment from today."}
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      {search.q || search.date ? (
                        <Button
                          variant="outline"
                          onClick={() => filter({ q: "", date: "" })}
                        >
                          Clear filters
                        </Button>
                      ) : (
                        <Button variant="outline" asChild>
                          <Link to="/entries/new" search={search}>
                            Write an entry
                          </Link>
                        </Button>
                      )}
                    </EmptyContent>
                  </Empty>
                )}
              </div>
              {result.totalPages > 1 && (
                <div className="list-pagination">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous page"
                    disabled={search.page <= 1}
                    onClick={() =>
                      navigate({ search: { ...search, page: search.page - 1 } })
                    }
                  >
                    <IconArrowLeft />
                  </Button>
                  <small>
                    Page {search.page} of {result.totalPages}
                  </small>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next page"
                    disabled={search.page >= result.totalPages}
                    onClick={() =>
                      navigate({ search: { ...search, page: search.page + 1 } })
                    }
                  >
                    <IconArrowRight />
                  </Button>
                </div>
              )}
            </section>
            <main
              className={`entry-pane ${!hasEditor ? "pane-hidden-mobile" : ""}`}
            >
              <Outlet />
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </WritingFocus.Provider>
  );
}
export function BlankPage() {
  const search = entriesRoute.useSearch();
  return (
    <div className="blank-page">
      <IconPencil className="blank-icon" />
      <h2>Make room for a thought.</h2>
      <p>
        Capture an idea, reflect on today,
        <br />
        or pick up where you left off.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/entries/new" search={{ ...search, view: "note" }}>
            New note
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/entries/new" search={{ ...search, view: "journal" }}>
            New journal entry
          </Link>
        </Button>
      </div>
      <small>Just for you. Saved in your private notebook.</small>
    </div>
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
