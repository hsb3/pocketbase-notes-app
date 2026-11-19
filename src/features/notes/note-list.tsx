import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search, SquarePen, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import type { listFolders } from "@/features/folders/data";
import { listNotes, ownerSession, searchNotes, searchTerm } from "./data";
import { preloadEditor } from "./note-editor";

export type ListPosition = {
  folder: string;
  page: number;
  q?: string;
  sp?: number;
  scroll: number;
  focus: string;
  fromList: boolean;
};

export function NoteList({
  user,
  folder,
  folders,
  title,
  page,
  q,
  sp,
  selected,
  refresh,
  compose,
  canCompose,
  position,
  showingList,
  fromList,
  focusSearch,
  choosing,
  entryKey,
  onPage,
  onSearch,
  clampPage,
}: {
  user: string;
  folder: string;
  folders: Awaited<ReturnType<typeof listFolders>>;
  title: string;
  page: number;
  q: string;
  sp: number;
  selected?: string;
  refresh: number;
  compose: (position: ListPosition) => void;
  canCompose: boolean;
  position?: ListPosition;
  showingList: boolean;
  fromList: boolean;
  focusSearch: boolean;
  choosing: boolean;
  entryKey?: string;
  onPage: (page: number) => void;
  onSearch: (q: string, sp: number) => void;
  clampPage: (sp: number) => void;
}) {
  const [field, setField] = useState(q);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Navigation and the leave dialog end the local field edit.
  useLayoutEffect(() => setField(q), [q, entryKey, choosing]);
  const input = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const composeButton = useRef<HTMLButtonElement>(null);
  const restored = useRef<string>(undefined);
  const [retry, reload] = useReducer((n) => n + 1, 0);
  const [reply, setReply] = useState<{
    refresh: number;
    retry: number;
    rows?: Awaited<ReturnType<typeof listNotes | typeof searchNotes>>;
    error?: string;
  }>();
  const [editorError, setEditorError] = useState("");
  const current =
    reply?.refresh === refresh && reply.retry === retry ? reply : undefined;
  const rows = current?.rows;
  const effectivePage = q ? sp : page;
  useEffect(() => {
    void preloadEditor().catch(() =>
      setEditorError("Could not load the editor. Reload to try again."),
    );
  }, []);
  useEffect(() => {
    let live = true;
    const session = ownerSession(user);
    (q ? searchNotes(q, sp) : listNotes(folder, page)).then(
      (rows) => {
        if (live && session.current()) setReply({ refresh, retry, rows });
      },
      () => {
        if (live && session.current())
          setReply({ refresh, retry, error: "Could not load notes." });
      },
    );
    return () => {
      live = false;
    };
  }, [user, folder, page, q, sp, refresh, retry]);
  useEffect(() => {
    if (q && rows && !rows.items.length && sp > Math.max(1, rows.totalPages))
      clampPage(Math.max(1, rows.totalPages));
  }, [q, sp, rows, clampPage]);

  useLayoutEffect(() => {
    if (!showingList) {
      restored.current = undefined;
      return;
    }
    if (!entryKey || restored.current === entryKey) return;
    if (
      position &&
      position.folder === folder &&
      position.page === page &&
      (position.q ?? "") === q &&
      (position.sp ?? 1) === sp &&
      scroll.current
    ) {
      if (!rows) return;
      scroll.current.scrollTop = position.scroll;
      const target =
        position.focus === "compose"
          ? composeButton.current
          : document.getElementById("row-" + position.focus);
      (target ?? input.current)?.focus({ preventScroll: true });
    } else if (focusSearch) input.current?.focus({ preventScroll: true });
    restored.current = entryKey;
  }, [showingList, rows, position, entryKey, focusSearch, folder, page, q, sp]);
  function listPosition(focus: string): ListPosition {
    return {
      fromList: showingList || (focus !== "compose" && fromList),
      folder,
      page,
      q: q || undefined,
      sp,
      scroll: scroll.current?.scrollTop ?? 0,
      focus,
    };
  }
  function search(next: string, nextPage = 1) {
    setField(selected ? q : next);
    if (showingList && next === q && nextPage === sp) {
      reload();
      input.current?.focus();
    } else onSearch(next, nextPage);
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] pb-[env(safe-area-inset-bottom)] md:grid-rows-[auto_auto_minmax(0,1fr)_auto] md:pb-0">
      <Button
        asChild
        size="sm"
        variant="ghost"
        className="col-span-2 row-start-1 m-2 justify-self-start md:hidden"
      >
        <Link to="/folders">
          <ChevronLeft />
          Folders
        </Link>
      </Button>
      <h2 className="col-start-1 row-start-2 self-center truncate px-4 py-3 text-2xl font-semibold tracking-tight max-md:col-span-2 md:row-start-1">
        {title}
      </h2>
      <form
        role="search"
        aria-label="Search notes"
        className="col-start-1 row-start-5 flex min-w-0 items-center gap-1 p-2 md:col-span-2 md:row-start-2"
        onSubmit={(event) => {
          event.preventDefault();
          search(searchTerm(field));
        }}
      >
        <Input
          type="search"
          aria-label="Search"
          placeholder="Search notes"
          enterKeyHint="search"
          ref={input}
          className="min-w-0 flex-1 [&::-webkit-search-cancel-button]:hidden"
          value={field}
          onChange={(event) => setField(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            ) {
              if (event.key === "Enter") event.preventDefault();
            } else if (event.key === "Escape") {
              event.preventDefault();
              search("");
            }
          }}
        />
        <Button type="submit" variant="ghost" size="icon" aria-label="Search">
          <Search />
        </Button>
        {(q || field) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear"
            onClick={() => search("")}
          >
            <X />
          </Button>
        )}
      </form>
      <Button
        aria-label="Compose"
        ref={composeButton}
        disabled={!canCompose}
        size="icon"
        className="col-start-2 row-start-5 mr-3 size-12 self-center rounded-full md:row-start-1 md:size-10"
        onClick={() => compose(listPosition("compose"))}
      >
        <SquarePen />
      </Button>
      <div
        ref={scroll}
        className="col-span-2 row-start-3 min-h-0 overflow-y-auto px-2 pb-2"
      >
        {editorError && <p role="alert">{editorError}</p>}
        {current?.error ? (
          <div role="alert">
            {current.error}{" "}
            <Button variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : !rows || (q && !rows.items.length && sp > 1) ? (
          <p>Loading notes…</p>
        ) : !rows.items.length ? (
          <Empty>
            <EmptyTitle>{q ? "No matching notes" : "No notes yet"}</EmptyTitle>
          </Empty>
        ) : (
          <nav aria-label="Notes">
            {rows.items.map((note) => (
              <Link
                key={note.id}
                id={"row-" + note.id}
                to="/notes/$noteId"
                params={{ noteId: note.id }}
                replace={!!selected && !!q}
                state={() => ({ origin: listPosition(note.id) })}
                aria-current={selected === note.id ? "page" : undefined}
                className="flex min-h-16 flex-col justify-center gap-1 rounded-lg border-b px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 aria-[current=page]:bg-accent"
              >
                <strong className="truncate text-sm">{note.title}</strong>
                {"snippet" in note ? (
                  <>
                    <span className="text-xs wrap-anywhere text-muted-foreground">
                      {folders.find((f) => f.id === note.folder)?.name}
                    </span>
                    <span className="text-sm wrap-anywhere">
                      {note.snippet.before}
                      {note.snippet.match && (
                        <mark className="bg-accent font-semibold text-accent-foreground">
                          {note.snippet.match}
                        </mark>
                      )}
                      {note.snippet.after}
                    </span>
                  </>
                ) : (
                  note.excerpt && (
                    <span className="truncate text-xs text-muted-foreground">
                      {note.excerpt}
                    </span>
                  )
                )}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {q && (
        <span role="status" className="sr-only">
          {rows && `${rows.totalItems} matching notes`}
        </span>
      )}
      {rows && rows.totalPages > 1 && (
        <div className="col-span-2 row-start-4 flex items-center justify-center gap-2 border-t p-2 text-xs">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous page"
            disabled={effectivePage <= 1}
            onClick={() => (q ? search(q, sp - 1) : onPage(page - 1))}
          >
            <ChevronLeft />
          </Button>
          <span>
            {effectivePage} / {rows.totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next page"
            disabled={effectivePage >= rows.totalPages}
            onClick={() => (q ? search(q, sp + 1) : onPage(page + 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
