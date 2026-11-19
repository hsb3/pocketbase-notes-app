import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, SquarePen } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyTitle } from "@/components/ui/empty";
import { listNotes } from "./data";
import { preloadEditor } from "./note-editor";

export type ListPosition = {
  folder: string;
  page: number;
  scroll: number;
  focus: string;
  fromList: boolean;
};

export function NoteList({
  folder,
  title,
  page,
  selected,
  refresh,
  compose,
  canCompose,
  position,
  showingList,
  onPage,
}: {
  folder: string;
  title: string;
  page: number;
  selected?: string;
  refresh: number;
  compose: (position: ListPosition) => void;
  canCompose: boolean;
  position?: ListPosition;
  showingList: boolean;
  onPage: (page: number) => void;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listNotes>>>();
  const [error, setError] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const composeButton = useRef<HTMLButtonElement>(null);
  const restore = useRef<ListPosition>(position);
  useEffect(() => {
    void preloadEditor().catch(() =>
      setError("Could not load the editor. Reload to try again."),
    );
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A save acknowledgement refreshes the current page.
  useEffect(() => {
    let current = true;
    listNotes(folder, page).then(
      (result) => {
        if (current) {
          setRows(result);
          setError("");
        }
      },
      () => {
        if (current) setError("Could not load notes.");
      },
    );
    return () => {
      current = false;
    };
  }, [folder, page, refresh]);
  useLayoutEffect(() => {
    const origin = restore.current ?? position;
    if (
      !showingList ||
      !rows ||
      !origin ||
      !scroll.current ||
      origin.folder !== folder ||
      origin.page !== page
    )
      return;
    const target =
      origin.focus === "compose"
        ? composeButton.current
        : document.getElementById("row-" + origin.focus);
    scroll.current.scrollTop = origin.scroll;
    target?.focus({ preventScroll: true });
    restore.current = undefined;
  }, [showingList, rows, position, folder, page]);
  function listPosition(focus: string): ListPosition {
    return {
      fromList: showingList,
      folder,
      page,
      scroll: scroll.current?.scrollTop ?? 0,
      focus,
    };
  }
  function remember(focus: string) {
    const origin = listPosition(focus);
    restore.current = origin;
    return origin;
  }
  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        <Button asChild size="sm" variant="ghost" className="md:invisible">
          <Link to="/folders">
            <ChevronLeft />
            Folders
          </Link>
        </Button>
        <Button
          aria-label="Compose"
          ref={composeButton}
          disabled={!canCompose}
          size="icon"
          className="absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 size-12 rounded-full shadow-md md:static md:size-10 md:shadow-none"
          onClick={() => compose(remember("compose"))}
        >
          <SquarePen />
        </Button>
      </div>
      <h2 className="shrink-0 truncate px-4 py-3 text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <div
        ref={scroll}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-20 md:pb-2"
      >
        {error ? (
          <p role="alert">{error}</p>
        ) : !rows ? (
          <p>Loading notes…</p>
        ) : !rows.items.length ? (
          <Empty>
            <EmptyTitle>No notes yet</EmptyTitle>
          </Empty>
        ) : (
          <nav aria-label="Notes">
            {rows.items.map((note) => (
              <Link
                key={note.id}
                id={"row-" + note.id}
                to="/notes/$noteId"
                params={{ noteId: note.id }}
                state={() => ({
                  origin: listPosition(note.id),
                })}
                onClick={() => remember(note.id)}
                aria-current={selected === note.id ? "page" : undefined}
                className="flex min-h-16 flex-col justify-center gap-1 rounded-lg border-b px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 aria-[current=page]:bg-accent"
              >
                <strong className="truncate text-sm">{note.title}</strong>
                {note.excerpt && (
                  <span className="truncate text-xs text-muted-foreground">
                    {note.excerpt}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {rows && rows.totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-t p-2 text-xs max-md:pr-16">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span>
            {page} / {rows.totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next page"
            disabled={page >= rows.totalPages}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </>
  );
}
