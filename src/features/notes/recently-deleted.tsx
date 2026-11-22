import {
  Link,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useReducer,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyTitle } from "@/components/ui/empty";
import { listFolders } from "@/features/folders/data";
import {
  confirms,
  readCommand,
  readTrash,
  responseStatus,
  sendCommand,
  type NoteCommand,
  type Session,
  type TrashRow,
} from "./actions";

export type CheckPhase = "uncertain" | "closed" | "checking" | "retry";

export function ActionCheck({
  phase,
  subject,
  close,
  check,
  quiet = false,
}: {
  phase: CheckPhase;
  subject: string;
  close: () => void;
  check: () => void;
  quiet?: boolean;
}) {
  const control = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (phase !== "checking" && !quiet) control.current?.focus();
  }, [phase, quiet]);
  const button = (
    <Button
      ref={control}
      size="sm"
      disabled={phase === "checking"}
      onClick={check}
    >
      {phase === "retry" ? "Retry" : "Check again"}
    </Button>
  );
  if (phase === "uncertain")
    return (
      <AlertDialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            control.current?.focus();
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Check {subject}</AlertDialogTitle>
            <AlertDialogDescription>
              The reply was interrupted. Check what was saved before trying
              again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {button}
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  return createPortal(
    <aside className="flex max-w-[95vw] items-center gap-3 rounded-lg border bg-background px-3 py-2 shadow-md">
      <span role="status" className="min-w-0 text-sm wrap-anywhere">
        {phase === "retry"
          ? "Could not verify " + subject + "."
          : phase === "checking"
            ? "Checking " + subject + "…"
            : "Unconfirmed " + subject + "."}
      </span>
      {button}
    </aside>,
    document.getElementById("action-statuses") ?? document.body,
  );
}

const trash = "recently-deleted";
const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
type Page = Awaited<ReturnType<typeof readTrash>>;
type Intent = {
  command: NoteCommand;
  title: string;
  phase: "sending" | CheckPhase;
  quiet?: boolean;
  index: number;
  page: number;
  refused?: boolean;
  result?: string;
  confirmedFolder?: string;
};

export function RecentlyDeleted({
  visible,
  session,
  user,
  folders,
  refresh,
  live,
  onRestored,
}: {
  visible: boolean;
  session: Session;
  user: string;
  folders: Awaited<ReturnType<typeof listFolders>>;
  refresh: number;
  live: number;
  onRestored: () => void;
}) {
  const navigate = useNavigate();
  const { history } = useRouter();
  const location = useLocation();
  const entry = location.state.__TSR_key;
  const value = Number(location.search.page);
  const page =
    visible && location.pathname === "/folders/" + trash
      ? Number.isSafeInteger(value) &&
        value > 1 &&
        Number.isSafeInteger((value - 1) * 20)
        ? value
        : 1
      : undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [rows, setRows] = useState<Page>();
  const [error, setError] = useState(false);
  const [message, announce] = useState("");
  const actions = useRef(new Map<string, Intent>()).current;
  const [, renderActions] = useReducer((n) => n + 1, 0);
  const fallback = folders.find((f) => f.is_default && f.user === user);
  function changePhase(action: Intent, phase: Intent["phase"]) {
    action.phase = phase;
    renderActions();
  }
  const reads = useRef(0);
  const desiredFocus = useRef<number | "heading" | undefined>(undefined);
  const here = () =>
    session.current() && history.location.pathname === "/folders/" + trash;
  const activeEntry = () => history.location.state.__TSR_key;
  const go = (next: number, replace = false) =>
    navigate({
      to: "/folders/$folderId",
      params: { folderId: trash },
      search: { page: next > 1 ? next : undefined },
      replace,
      ignoreBlocker: replace && here(),
    });

  function show(data: Page, focus?: number | "heading") {
    if (data.page > Math.max(1, data.totalPages)) {
      void go(Math.max(1, data.totalPages), true);
      return;
    }
    setError(false);
    desiredFocus.current = focus;
    setRows(data);
  }
  async function load(focus?: "heading") {
    if (!page || !here()) return;
    const key = activeEntry();
    const ticket = ++reads.current;
    try {
      const data = await readTrash(page, session);
      if (here() && key === activeEntry() && ticket === reads.current)
        show(data, focus);
    } catch {
      if (here() && key === activeEntry() && ticket === reads.current)
        setError(true);
    }
  }
  const enter = useEffectEvent(() => {
    ++reads.current;
    setRows(undefined);
    setError(false);
    if (!page || !here()) {
      announce("");
      return;
    }
    if (location.searchStr !== (page > 1 ? "?page=" + page : "")) {
      void go(page, true);
      return;
    }
    heading.current?.focus();
    void load();
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: Entry changes and reselecting the destination require an authoritative read.
  useEffect(() => {
    enter();
  }, [entry, page, refresh]);

  const refreshVisible = useEffectEvent(() => {
    if (document.visibilityState === "visible") void load();
  });
  useEffect(() => {
    if (!page) return;
    document.addEventListener("visibilitychange", refreshVisible);
    return () =>
      document.removeEventListener("visibilitychange", refreshVisible);
  }, [page]);
  const lastLive = useRef(live);
  // A restore in flight re-reads the trash itself; a second read would void its focus hand-off.
  const quiet = useEffectEvent(() => {
    if (!actions.size) void load();
  });
  useEffect(() => {
    if (lastLive.current === live) return;
    lastLive.current = live;
    quiet();
  }, [live]);
  const expired = useEffectEvent(() => {
    void load();
  });
  useEffect(() => {
    if (!page || !rows?.items.length || error) return;
    const remaining =
      Math.min(...rows.items.map((n) => Date.parse(n.deadline))) -
      Date.parse(rows.serverNow);
    const timer = window.setTimeout(
      expired,
      Math.max(1, Math.min(remaining, 2147483647)),
    );
    return () => clearTimeout(timer);
  }, [page, rows, error]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Focus the successor only after the authoritative rows render.
  useLayoutEffect(() => {
    const target = desiredFocus.current;
    if (target === undefined) return;
    desiredFocus.current = undefined;
    const controls = Array.from(list.current?.querySelectorAll("button") ?? []);
    const enabled = (control: HTMLButtonElement) => !control.disabled;
    const next =
      typeof target === "number"
        ? (controls.slice(target).find(enabled) ??
          controls.slice(0, target).reverse().find(enabled))
        : undefined;
    (next ?? heading.current)?.focus();
  }, [rows]);

  async function destination(id: string) {
    const known = folders.find((f) => f.id === id);
    if (known) return known.name;
    const fresh = await listFolders();
    return fresh.find((f) => f.user === user && f.id === id)?.name ?? id;
  }
  async function reconcile(original: Intent, verify: boolean) {
    const key = activeEntry();
    const onTrash = here();
    const readPage = onTrash && page ? page : original.page;
    try {
      let notice = original.result;
      if (original.confirmedFolder)
        notice =
          "Restored to " + (await destination(original.confirmedFolder)) + ".";
      else if (verify && !notice) {
        const row = await readCommand(original.command, session);
        if (!row) notice = "Note is no longer available.";
        else if (!row.deleted)
          notice =
            !original.refused && confirms(row, original.command)
              ? "Restored to " + (await destination(row.folder)) + "."
              : "Note is active in " + (await destination(row.folder)) + ".";
        else notice = "Note is still in Recently Deleted.";
      }
      const ticket = ++reads.current;
      const data = await readTrash(readPage, session);
      if (!session.current() || !actions.delete(original.command.id)) return;
      renderActions();
      onRestored();
      if (onTrash && here() && activeEntry() === key) {
        announce(notice ?? "");
        const same = data.items.findIndex(
          (row) => row.id === original.command.id,
        );
        if (ticket === reads.current)
          show(data, same >= 0 ? same : original.index);
      }
    } catch {
      if (session.current() && actions.has(original.command.id)) {
        original.quiet = key !== activeEntry();
        changePhase(original, "retry");
      }
    }
  }

  async function restore(row: TrashRow, index: number) {
    if (actions.has(row.id) || !page || !fallback || !here()) return;
    const command = {
      id: row.id,
      user,
      revision: row.revision,
      originalFolder: row.folder,
      destination: row.folder || fallback.id,
    };
    const action: Intent = {
      command,
      index,
      page,
      title: row.title,
      phase: "sending",
    };
    actions.set(row.id, action);
    renderActions();
    announce("");
    try {
      const saved = await sendCommand(command, session, true);
      action.confirmedFolder = saved.folder;
    } catch (e) {
      if (!session.current()) return;
      const status = responseStatus(e);
      if (status === 404) action.refused = true;
      else if (status === 410)
        action.result = "The recovery period has expired.";
      else if (status === 409 || status === 400)
        action.result = "The note changed. Review its current state.";
      else {
        changePhase(action, "uncertain");
        return;
      }
    }
    if (session.current()) await reconcile(action, !!action.refused);
  }

  const pending = Array.from(actions.values());
  const modal = pending.find((action) => action.phase === "uncertain");
  const blockNavigation =
    !!modal || pending.some((action) => action.phase === "sending");
  useLayoutEffect(() => {
    if (blockNavigation)
      return history.block({
        blockerFn: () => true,
        enableBeforeUnload: false,
      });
  }, [blockNavigation, history]);
  return (
    <>
      {pending.map(
        (action) =>
          action.phase !== "sending" &&
          (action.phase !== "uncertain" || action === modal) && (
            <ActionCheck
              key={action.command.id}
              subject={`restore of “${action.title}”`}
              phase={action.phase}
              quiet={action.quiet}
              close={() => changePhase(action, "closed")}
              check={() => {
                if (action.phase === "checking") return;
                action.quiet = false;
                changePhase(action, "checking");
                void reconcile(action, true);
              }}
            />
          ),
      )}
      {page && (
        <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="m-2 self-start md:hidden"
          >
            <Link to="/folders" state={{ focusTrash: true }}>
              <ChevronLeft />
              Folders
            </Link>
          </Button>
          <h2
            ref={heading}
            tabIndex={-1}
            className="m-2 rounded-md px-2 py-1 text-2xl font-semibold tracking-tight focus-visible:outline-2"
          >
            Recently Deleted
          </h2>
          <div role="status" className="px-4 text-sm">
            {message}
          </div>
          {error ? (
            <div role="alert" className="p-4">
              Could not load recently deleted notes.{" "}
              <Button
                autoFocus
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(false);
                  heading.current?.focus();
                  void load("heading");
                }}
              >
                Retry
              </Button>
            </div>
          ) : !rows ? (
            <p className="px-4">Loading notes…</p>
          ) : !rows.items.length ? (
            <Empty>
              <Trash2 aria-hidden="true" className="text-muted-foreground" />
              <EmptyTitle>No recently deleted notes</EmptyTitle>
            </Empty>
          ) : (
            <ul ref={list} className="min-h-0 flex-1 overflow-y-auto px-3">
              {rows.items.map((row, index) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b px-1 py-3"
                >
                  <div className="min-w-0 flex-1 basis-32">
                    <strong className="block text-sm wrap-anywhere">
                      {row.title}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      Recover until{" "}
                      <time dateTime={row.deadline}>
                        {dateFormat.format(new Date(row.deadline))}
                      </time>
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={"Restore " + row.title}
                    disabled={actions.has(row.id) || !fallback}
                    onClick={() => void restore(row, index)}
                  >
                    {actions.get(row.id)?.phase === "sending"
                      ? "Restoring…"
                      : "Restore"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {rows && rows.totalPages > 0 && (
            <div className="flex items-center justify-center gap-2 border-t p-2 text-xs">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => void go(page - 1)}
              >
                <ChevronLeft />
              </Button>
              {page} / {Math.max(1, rows.totalPages)}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Next page"
                disabled={page >= rows.totalPages}
                onClick={() => void go(page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
