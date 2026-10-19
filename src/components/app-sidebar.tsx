"use client";

import * as React from "react";
import {
  BookOpen,
  Command,
  File,
  Inbox,
  Star,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { entriesRoute } from "@/features/entries/workspace";
import { bodyText } from "@/features/entries/data";
import { DatePicker } from "@/features/entries/date-picker";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { pb } from "@/services/pocketbase";

import { NavUser } from "@/components/nav-user";
import { Label } from "@/components/ui/label";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";

const navMain = [
  { title: "All entries", view: "all", icon: Inbox },
  { title: "Notes", view: "note", icon: File },
  { title: "Journal", view: "journal", icon: BookOpen },
  { title: "Favorites", view: "favorites", icon: Star },
] as const;

export function AppSidebar({
  focused,
  ...props
}: React.ComponentProps<typeof Sidebar> & { focused: boolean }) {
  const search = entriesRoute.useSearch();
  const result = entriesRoute.useLoaderData();
  const navigate = entriesRoute.useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const activeItem =
    navMain.find((item) => item.view === search.view) || navMain[0];
  const [query, setQuery] = React.useState(search.q);
  React.useEffect(() => setQuery(search.q), [search.q]);
  const { open, isMobile, setOpen, setOpenMobile } = useSidebar();
  const user = {
    name: pb.authStore.record?.name || "My notebook",
    email: pb.authStore.record?.email || "",
    avatar: "",
  };

  return (
    <Sidebar
      collapsible={focused ? "offcanvas" : "icon"}
      aria-hidden={focused || undefined}
      inert={focused}
      className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
      {...props}
    >
      {/* This is the first sidebar */}
      {/* We disable collapsible and adjust width to icon. */}
      {/* This will make the sidebar appear as icons. */}
      <Sidebar
        collapsible="none"
        className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0">
                <Link to="/entries" search={search}>
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Command className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      PocketBase Notes
                    </span>
                    <span className="truncate text-xs">Private notebook</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent className="px-1.5 md:px-0">
              <SidebarMenu>
                {navMain.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={{
                        children: item.title,
                        hidden: false,
                      }}
                      onClick={() => {
                        void navigate({
                          to: "/entries",
                          search: {
                            ...search,
                            view: item.view,
                            q: "",
                            date: "",
                            page: 1,
                          },
                        });
                        setOpen(true);
                      }}
                      isActive={activeItem.title === item.title}
                      aria-label={item.title}
                      className="px-2.5 md:px-2"
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={user} />
        </SidebarFooter>
      </Sidebar>

      {/* This is the second sidebar */}
      {/* Unmount the collapsed panel so its portaled calendar closes too. */}
      {(open || isMobile) && (
        <Sidebar
          collapsible="none"
          className="min-w-0 flex-1"
          role="region"
          aria-label="Entries"
        >
          <SidebarHeader className="gap-3.5 border-b p-4">
            <div className="flex w-full items-center justify-between">
              <div className="font-medium text-base text-foreground">
                {activeItem?.title}
              </div>
              <Label className="flex items-center gap-2 text-sm">
                <span>Favorites</span>
                <Switch
                  className="shadow-none"
                  checked={search.view === "favorites"}
                  onCheckedChange={(checked) =>
                    navigate({
                      search: {
                        ...search,
                        view: checked ? "favorites" : "all",
                        date: "",
                        page: 1,
                      },
                    })
                  }
                />
              </Label>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void navigate({ search: { ...search, q: query, page: 1 } });
              }}
              className="flex gap-1"
            >
              <SidebarInput
                aria-label="Search titles"
                placeholder="Search titles…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button type="submit" size="sm" variant="ghost">
                Search
              </Button>
            </form>
            <Button asChild size="sm">
              <Link
                to="/entries/new"
                search={search}
                onClick={() => setOpenMobile(false)}
              >
                <Plus />
                {search.view === "journal" ? "New journal entry" : "New entry"}
              </Link>
            </Button>
            {search.view === "journal" && (
              <DatePicker
                clearable
                value={search.date}
                onChange={(date) =>
                  navigate({ search: { ...search, date, page: 1 } })
                }
              />
            )}
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup className="px-0">
              <SidebarGroupContent>
                {!result.items.length && (
                  <Empty className="p-4">
                    <EmptyHeader>
                      <EmptyTitle>No entries here yet</EmptyTitle>
                      <EmptyDescription>
                        {search.q || search.date
                          ? "Try another title or date."
                          : "Create a note or journal entry to get started."}
                      </EmptyDescription>
                    </EmptyHeader>
                    {(search.q || search.date) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate({
                            search: { ...search, q: "", date: "", page: 1 },
                          })
                        }
                      >
                        Clear filters
                      </Button>
                    )}
                  </Empty>
                )}
                {result.items.map((entry) => (
                  <Link
                    to="/entries/$entryId"
                    params={{ entryId: entry.id }}
                    search={search}
                    onClick={() => setOpenMobile(false)}
                    aria-current={
                      pathname.endsWith(`/${entry.id}`) ? "page" : undefined
                    }
                    key={entry.id}
                    className="flex flex-col items-start gap-2 whitespace-nowrap border-b p-4 text-sm leading-tight last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent"
                  >
                    <div className="flex w-full items-center gap-2">
                      <span>
                        {entry.kind === "journal" ? "Journal" : "Note"}
                        {entry.favorite && (
                          <Star
                            className="ml-1 inline size-3"
                            aria-label="Favorite"
                          />
                        )}
                      </span>{" "}
                      <span className="ml-auto text-xs">
                        {new Date(
                          entry.kind === "journal"
                            ? `${entry.journal_date}T12:00:00`
                            : entry.updated.replace(" ", "T"),
                        ).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <span className="w-full truncate font-medium">
                      {entry.title}
                    </span>
                    <span className="line-clamp-2 w-full whitespace-break-spaces text-xs">
                      {bodyText(entry.body)}
                    </span>
                  </Link>
                ))}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          {result.totalPages > 1 && (
            <SidebarFooter>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous page"
                  disabled={search.page <= 1}
                  onClick={() =>
                    navigate({ search: { ...search, page: search.page - 1 } })
                  }
                >
                  <ChevronLeft />
                </Button>
                <small>
                  {search.page} / {result.totalPages}
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
                  <ChevronRight />
                </Button>
              </div>
            </SidebarFooter>
          )}
        </Sidebar>
      )}
    </Sidebar>
  );
}
