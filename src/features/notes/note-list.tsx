import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Pin,
  Search,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import type { listFolders } from "@/features/folders/data";
import {
  listNotes,
  ownerSession,
  searchNotes,
  searchTerm,
  validDate,
} from "./data";
import { formatDay } from "./journal-date";
import { preloadEditor } from "./note-editor";

export type ListPosition = {
  folder: string;
  page: number;
  q?: string;
  sp?: number;
  day?: string;
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
  live,
  compose,
  canCompose,
  deleteFolder,
  deletingFolder,
  position,
  showingList,
  fromList,
  focusSearch,
  choosing,
  entryKey,
  onPage,
  onSearch,
  clampPage,
  day,
  onDay,
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
  live: number;
  compose: (position: ListPosition) => void;
  canCompose: boolean;
  deleteFolder?: () => void;
  deletingFolder: boolean;
  position?: ListPosition;
  showingList: boolean;
  fromList: boolean;
  focusSearch: boolean;
  choosing: boolean;
  entryKey?: string;
  onPage: (page: number) => void;
  onSearch: (q: string, sp: number) => void;
  clampPage: (sp: number) => void;
  day: string;
  onDay: (day: string) => void;
}) {
  const journal = folder === "journal";
  const dayInput = useRef<HTMLInputElement>(null);
  const [dayField, setDayField] = useState(day);
  useLayoutEffect(() => setDayField(day), [day]);
  const [field, setField] = useState(q);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Navigation and the leave dialog end the local field edit.
  useLayoutEffect(() => setField(q), [q, entryKey, choosing]);
  const heading = useRef<HTMLHeadingElement>(null);
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
    (q ? searchNotes(q, sp) : listNotes(folder, page, day)).then(
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
  }, [user, folder, page, q, sp, day, refresh, retry]);
  // A change elsewhere re-reads in place: the rows shown stay until new ones arrive.
  const lastLive = useRef(live);
  useEffect(() => {
    if (lastLive.current === live) return;
    lastLive.current = live;
    let current = true;
    const session = ownerSession(user);
    (q ? searchNotes(q, sp) : listNotes(folder, page, day)).then(
      (rows) => {
        if (current && session.current())
          setReply((shown) =>
            shown?.rows && shown.refresh === refresh && shown.retry === retry
              ? { refresh, retry, rows }
              : shown,
          );
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [user, folder, page, q, sp, day, refresh, retry, live]);
  useEffect(() => {
    if (
      rows &&
      !rows.items.length &&
      effectivePage > Math.max(1, rows.totalPages)
    )
      clampPage(Math.max(1, rows.totalPages));
  }, [effectivePage, rows, clampPage]);

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
      (position.day ?? "") === day &&
      scroll.current
    ) {
      if (!rows) return;
      scroll.current.scrollTop = position.scroll;
      const target =
        position.focus === "compose"
          ? composeButton.current
          : document.getElementById("row-" + position.focus);
      (target ?? input.current)?.focus({ preventScroll: true });
    } else if (document.activeElement === dayInput.current) {
      // Choosing a day replaces the address; keep focus in the filter.
    } else if (focusSearch) input.current?.focus({ preventScroll: true });
    else if (folder !== "all") heading.current?.focus({ preventScroll: true });
    restored.current = entryKey;
  }, [
    showingList,
    rows,
    position,
    entryKey,
    focusSearch,
    folder,
    page,
    q,
    sp,
    day,
  ]);
  function listPosition(focus: string): ListPosition {
    return {
      fromList: showingList || (focus !== "compose" && fromList),
      folder,
      page,
      q: q || undefined,
      sp,
      day: day || undefined,
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
      <header className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1 px-3 py-2 max-md:col-span-2 md:row-start-1">
        <h2
          ref={heading}
          tabIndex={-1}
          className="min-w-0 truncate text-2xl font-semibold tracking-tight"
        >
          {title}
        </h2>
        {deleteFolder && (
          <Button
            id="delete-folder"
            variant="ghost"
            size="icon"
            aria-label="Delete folder"
            disabled={deletingFolder}
            onClick={deleteFolder}
          >
            <Trash2 />
          </Button>
        )}
        {journal && (
          <span className="flex min-w-0 items-center gap-1">
            <Input
              ref={dayInput}
              type="date"
              aria-label="Filter by day"
              min="0001-01-01"
              max="9999-12-31"
              className="h-8 w-auto min-w-0"
              value={dayField}
              onChange={(event) => {
                const value = event.target.value;
                setDayField(value);
                if (validDate(value) && value !== day) onDay(value);
              }}
            />
            {day && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Clear day filter"
                onClick={() => {
                  onDay("");
                  dayInput.current?.focus();
                }}
              >
                Clear
              </Button>
            )}
          </span>
        )}
      </header>
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
            <Button
              autoFocus={showingList}
              variant="outline"
              size="sm"
              onClick={reload}
            >
              Retry
            </Button>
          </div>
        ) : !rows || (!rows.items.length && effectivePage > 1) ? (
          <p>Loading notes…</p>
        ) : !rows.items.length ? (
          <Empty>
            <EmptyTitle>
              {q
                ? "No matching notes"
                : folder === "pinned"
                  ? "No pinned notes"
                  : journal && day
                    ? "No notes on " + formatDay(day)
                    : journal
                      ? "No journal notes"
                      : "No notes yet"}
            </EmptyTitle>
            {!q && folder === "pinned" && (
              <EmptyDescription>
                Pin a note from its actions menu.
              </EmptyDescription>
            )}
            {!q && journal && !day && (
              <EmptyDescription>
                Add a date from a note's actions menu.
              </EmptyDescription>
            )}
            {!q && journal && day && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onDay("");
                  dayInput.current?.focus();
                }}
              >
                Clear day
              </Button>
            )}
          </Empty>
        ) : (
          <nav aria-label="Notes">
            {rows.items.map((note, i) => (
              <Fragment key={note.id}>
                {journal &&
                  !q &&
                  "journal_date" in note &&
                  note.journal_date &&
                  (i === 0 ||
                    (rows.items[i - 1] as typeof note).journal_date !==
                      note.journal_date) && (
                    <h3 className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground">
                      {formatDay(note.journal_date)}
                    </h3>
                  )}
                <Link
                  id={"row-" + note.id}
                  to="/notes/$noteId"
                  params={{ noteId: note.id }}
                  replace={!!selected && !!q}
                  state={() => ({ origin: listPosition(note.id) })}
                  aria-current={selected === note.id ? "page" : undefined}
                  className="flex min-h-16 flex-col justify-center gap-1 rounded-lg border-b px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 aria-[current=page]:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <strong className="truncate text-sm">{note.title}</strong>
                    {"pinned" in note && note.pinned && (
                      <Pin
                        role="img"
                        aria-label="Pinned"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    )}
                  </span>
                  {(folder === "pinned" || journal) && !q && (
                    <span className="text-xs wrap-anywhere text-muted-foreground">
                      {folders.find((f) => f.id === note.folder)?.name}
                    </span>
                  )}
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
              </Fragment>
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
