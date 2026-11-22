import {
  useLocation,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useLayoutEffect,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { defaultFolder, listFolders } from "@/features/folders/data";
import { DeleteFolder } from "@/features/folders/delete-folder";
import { RecentlyDeleted } from "./recently-deleted";
import { FolderList } from "@/features/folders/folder-list";
import { pb } from "@/services/pocketbase";
import { cn } from "@/utils/classnames";
import { ClientResponseError, getTokenPayload } from "pocketbase";
import { heldDraft, forgetDraft, parkDraft } from "./suspended-draft";
import { getNote, ownerSession, verifyOwner, NoteAccessError } from "./data";
import {
  confirms,
  readCommand,
  responseStatus,
  sendCommand,
  setPin,
  type NoteCommand,
  type NoteState,
} from "./actions";
import { NoteActions, type ActionPanel, type PinState } from "./note-actions";
import { NoteDraft } from "./draft";
import { LeaveDialog } from "./leave-dialog";
import { type Notice, watchNotebook } from "./live";
import { NoteEditor } from "./note-editor";
import { NoteList, type ListPosition } from "./note-list";

declare module "@tanstack/react-router" {
  interface HistoryState {
    origin?: ListPosition;
    focusSearch?: boolean;
    focusTrash?: boolean;
  }
}

function currentBinding() {
  const user =
    pb.authStore.record?.collectionName === "users" && pb.authStore.isValid
      ? pb.authStore.record.id
      : "";
  return { user, session: ownerSession(user) };
}

export function Workspace() {
  const navigate = useNavigate();
  const active = useRef<NoteDraft>(undefined);
  const [binding, setBinding] = useState(currentBinding);
  const [entry, setEntry] = useState<"opening" | "ready" | "retry">(() =>
    binding.user && !heldDraft(binding.user) ? "ready" : "opening",
  );
  useLayoutEffect(() => {
    function detach() {
      if (active.current) parkDraft(active.current);
      active.current = undefined;
    }
    function changed() {
      detach();
      setEntry("opening");
      setBinding(currentBinding());
    }
    const stop = pb.authStore.onChange(changed);
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiry() {
      if (!binding.session.sameEpoch()) return changed();
      if (!binding.user) return;
      if (!pb.authStore.isValid) {
        detach();
        pb.authStore.clear();
        return;
      }
      const remaining =
        getTokenPayload(binding.session.token).exp * 1000 - Date.now();
      timer = setTimeout(
        checkExpiry,
        Math.min(Math.max(remaining, 1), 2147483647),
      );
    }
    checkExpiry();
    return () => {
      stop();
      clearTimeout(timer);
      detach();
    };
  }, [binding]);
  useEffect(() => {
    if (entry !== "opening") return;
    let current = true;
    const { user, session } = binding;
    async function open() {
      if (!user) {
        await navigate({
          to: "/auth/login",
          replace: true,
          ignoreBlocker: true,
        });
        return;
      }
      const held = heldDraft(user);
      if (held) {
        try {
          await verifyOwner(user, session);
        } catch (error) {
          if (
            !current ||
            !session.sameEpoch() ||
            pb.authStore.token !== session.token
          )
            return;
          if (
            error instanceof NoteAccessError ||
            (error instanceof ClientResponseError &&
              [401, 403].includes(error.status))
          )
            pb.authStore.clear();
          else setEntry("retry");
          return;
        }
        if (!current || !session.current()) return;
        await navigate({
          to: "/notes/$noteId",
          params: { noteId: held.id },
          replace: true,
          ignoreBlocker: true,
        });
      } else {
        await navigate({
          to: "/folders/$folderId",
          params: { folderId: "all" },
          replace: true,
          ignoreBlocker: true,
        });
      }
      if (current && session.current()) setEntry("ready");
    }
    void open();
    return () => {
      current = false;
    };
  }, [binding, entry, navigate]);
  if (entry === "retry")
    return (
      <Button onClick={() => setEntry("opening")}>Retry sign-in check</Button>
    );
  if (entry !== "ready" || !binding.session.current()) return null;
  return <Library binding={binding} active={active} />;
}

function Library({
  binding,
  active,
}: {
  binding: ReturnType<typeof currentBinding>;
  active: RefObject<NoteDraft | undefined>;
}) {
  const { user, session } = binding;
  const navigate = useNavigate();
  const { history } = useRouter();
  const { folderId, noteId } = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const locationState = useLocation({ select: (location) => location.state });
  const origin = locationState.origin;
  const [folders, setFolders] = useState<
    Awaited<ReturnType<typeof listFolders>>
  >([]);
  const [folderError, setFolderError] = useState("");
  const [refresh, refreshList] = useReducer((value) => value + 1, 0);
  const [, renderDraft] = useReducer((value) => value + 1, 0);
  const returning = useRef<ListPosition>(undefined);
  const pending = useRef<{
    note: NoteDraft;
    proceed: () => void;
    signOut: boolean;
    choosing: boolean;
    metadata: boolean;
  }>(undefined);
  const [notice, announce] = useState("");
  const [panel, setPanel] = useState<ActionPanel>();
  // Held beside the draft, never in its save baseline: a pin is not an edit.
  const [pin, setPinState] = useState<PinState>();
  const command = useRef<NoteCommand & { refused?: boolean }>(undefined);
  const checking = useRef(false);
  // The newest notice for the open note that arrived while it was busy.
  const kept = useRef<Notice>(undefined);
  const reading = useRef(false);
  const follow = useRef<(notice?: Notice) => void>(undefined);
  const [readAttempt, retryDetail] = useReducer((n) => n + 1, 0);
  const [readError, setReadError] = useState(false);
  const documentPane = useRef<HTMLElement>(null);
  const [opening, setOpening] = useState<string>();
  const [failedId, setFailedId] = useState<string>();
  const selected = opening ?? noteId;
  const draft = active.current?.id === selected ? active.current : undefined;
  const folder = folderId ?? origin?.folder ?? draft?.folder ?? "all";
  const page = folderId ? (search.page ?? 1) : (origin?.page ?? 1);
  const q = (folderId ? search.q : origin?.q) ?? "";
  const sp = (folderId ? search.sp : origin?.sp) ?? 1;
  const folderRecord = folders.find((item) => item.id === folder);
  const target =
    folder === "all" || folder === "pinned"
      ? folders.find((item) => item.is_default)
      : folderRecord;

  const [deletions, setDeletions] = useState<typeof folders>([]);
  const isTrash = folderId === "recently-deleted";
  const [trashRefresh, refreshTrash] = useReducer((n) => n + 1, 0);
  useLayoutEffect(() => {
    if (!folderId && !selected && locationState.focusTrash)
      document
        .querySelector<HTMLElement>('a[href="/folders/recently-deleted"]')
        ?.focus();
  }, [folderId, selected, locationState.focusTrash]);

  useEffect(() => {
    let current = true;
    listFolders()
      .then((rows) => {
        if (!current || !session.current()) return;
        defaultFolder(rows, user);
        setFolders(rows);
        setFolderError("");
        if (
          folderId &&
          /^[a-z0-9]{15}$/.test(folderId) &&
          !rows.some((f) => f.id === folderId)
        )
          void navigate({
            to: "/folders/$folderId",
            params: { folderId: "all" },
            search: {},
            state: { focusSearch: true },
            replace: true,
          });
      })
      .catch(() => {
        if (current) setFolderError("Could not load the notebook folders.");
      });
    return () => {
      current = false;
    };
  }, [user, folderId, navigate, session]);

  useEffect(() => {
    const watch = watchNotebook(
      (notice) => {
        if (session.current()) follow.current?.(notice);
      },
      () => undefined,
    );
    return watch.stop;
  }, [session]);

  const makeDraft = useCallback(
    (
      folder: string,
      note?: Awaited<ReturnType<typeof getNote>>,
      held?: ReturnType<typeof heldDraft>,
    ) =>
      new NoteDraft(
        {
          user,
          folder,
          note,
          onChange: () => {
            if (active.current?.failure === "locked") {
              parkDraft(active.current);
              active.current = undefined;
              if (pb.authStore.token === session.token) pb.authStore.clear();
            } else renderDraft();
          },
          onSaved: refreshList,
        },
        held,
      ),
    [user, session, active],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry repeats the current detail read.
  useEffect(() => {
    let current = true;
    setOpening(undefined);
    setFailedId(undefined);
    setReadError(false);
    if (active.current?.id !== noteId) {
      active.current?.dispose();
      active.current = undefined;
      const held = heldDraft(user);
      if (held && held.id === noteId) {
        active.current = makeDraft(held.folder, undefined, held);
        forgetDraft(user);
        renderDraft();
      } else if (noteId)
        getNote(noteId, session)
          .then((note) => {
            if (!current || !session.current()) return;
            active.current = makeDraft(note.folder, note);
            setPinState({ id: note.id, pinned: !!note.pinned });
            if (command.current?.id === note.id) active.current.pause();
            renderDraft();
          })
          .catch((error) => {
            if (!current || !session.current()) return;
            if (
              error instanceof NoteAccessError ||
              (error instanceof ClientResponseError && error.status === 404)
            ) {
              setFailedId(noteId);
              focusInDocument('[aria-label="Back"]', noteId);
            } else setReadError(true);
          });
    }
    return () => {
      current = false;
    };
  }, [noteId, user, session, makeDraft, active, readAttempt]);

  const guard = useCallback(
    async (signOut: boolean, proceed: () => void, metadata = false) => {
      if (pending.current || !session.current()) return;
      const note = active.current;
      if (!note?.dirty) return proceed();
      const intent = { note, proceed, signOut, choosing: false, metadata };
      pending.current = intent;
      if (!signOut) {
        const saved = await note.flush();
        if (
          active.current !== note ||
          !note.current ||
          pending.current !== intent
        )
          return;
        if (saved && !note.dirty) {
          pending.current = undefined;
          return proceed();
        }
      }
      note.pause();
      intent.choosing = true;
      renderDraft();
    },
    [active, session],
  );

  useLayoutEffect(
    () =>
      history.block({
        enableBeforeUnload: () => !!active.current?.dirty,
        blockerFn: ({ currentLocation, nextLocation, action }) => {
          const path = nextLocation.pathname;
          if (active.current && path === "/notes/" + active.current.id)
            return false;
          const remember = () => {
            returning.current =
              noteId &&
              origin &&
              action !== "PUSH" &&
              path === "/folders/" + origin.folder
                ? origin
                : undefined;
          };
          if (
            pending.current ||
            panel?.phase === "sending" ||
            panel?.phase === "uncertain" ||
            panel?.phase === "choose"
          )
            return true;
          const note = active.current;
          if (!note?.dirty) {
            remember();
            return false;
          }
          const replay = () => {
            remember();
            const bypass = { ignoreBlocker: true };
            if (action === "PUSH")
              history.push(nextLocation.href, nextLocation.state, bypass);
            else if (action === "REPLACE")
              history.replace(nextLocation.href, nextLocation.state, bypass);
            else
              history.go(
                nextLocation.state.__TSR_index -
                  currentLocation.state.__TSR_index,
                bypass,
              );
          };
          const decide = () => void guard(path === "/auth/logout", replay);
          if (action === "PUSH" || action === "REPLACE") decide();
          else {
            // History rolls a blocked pop back. Finish that traversal before waiting for a save.
            window.addEventListener(
              "popstate",
              (event) => {
                if (
                  event.state?.__TSR_key === currentLocation.state.__TSR_key &&
                  active.current === note &&
                  note.current
                )
                  decide();
              },
              { once: true },
            );
          }
          return true;
        },
      }),
    [history, active, guard, noteId, origin, panel?.phase],
  );

  function cancel() {
    const intent = pending.current;
    pending.current = undefined;
    if (intent?.metadata) setPanel(undefined);
    if (intent && command.current?.id !== intent.note.id) intent.note.resume();
    renderDraft();
  }

  async function finish(save: boolean) {
    const intent = pending.current;
    if (!intent || intent.note.busy || !intent.note.current) return;
    const { note } = intent;
    if (save) {
      if (command.current?.id === note.id) {
        cancel();
        return;
      }
      note.resume();
      const saving = note.failure ? note.retry() : note.flush();
      renderDraft();
      const saved = await saving;
      if (
        pending.current !== intent ||
        active.current !== note ||
        !note.current
      )
        return;
      if (!saved || note.dirty) {
        note.pause();
        renderDraft();
        return;
      }
    }
    if (intent.metadata) {
      if (!save && !(await note.discardForAction())) {
        cancel();
        return;
      }
      if (
        !note.current ||
        active.current !== note ||
        pending.current !== intent
      )
        return;
      pending.current = undefined;
      intent.proceed();
      return;
    }
    pending.current = undefined;
    note.dispose();
    active.current = undefined;
    renderDraft();
    intent.proceed();
  }

  function selectFolder(
    id: string,
    {
      page = 1,
      q = "",
      sp = 1,
    }: { page?: number; q?: string; sp?: number } = {},
    replace = false,
    focusSearch = false,
    ignoreBlocker = false,
  ) {
    return navigate({
      to: "/folders/$folderId",
      params: { folderId: id },
      search: {
        page: page > 1 ? page : undefined,
        q: q || undefined,
        sp: q && sp > 1 ? sp : undefined,
      },
      state: focusSearch ? { focusSearch } : {},
      ignoreBlocker,
      replace,
    });
  }
  function back() {
    if (origin?.fromList && history.canGoBack()) {
      const leave = () => {
        returning.current = origin;
        history.back({ ignoreBlocker: true });
      };
      void guard(false, leave);
    } else void selectFolder(folder, { page, q, sp }, true);
  }

  function compose(from: ListPosition) {
    if (!target) return;
    const open = () => {
      active.current?.dispose();
      const next = makeDraft(target.id);
      setPinState({ id: next.id, pinned: false });
      // Focus the warmed editor during the tap for the mobile software keyboard.
      flushSync(() => {
        active.current = next;
        setOpening(next.id);
      });
      void navigate({
        to: "/notes/$noteId",
        params: { noteId: next.id },
        state: { origin: from },
      });
    };
    void guard(false, open);
  }

  function dismissAction() {
    if (panel?.phase === "uncertain") setPanel({ ...panel, phase: "closed" });
    else if (panel?.phase === "choose") flushSync(() => setPanel(undefined));
  }

  const nextFocus = useRef<() => void>(undefined);
  function focusInDocument(selector: string, id: string) {
    nextFocus.current = () => {
      if (session.current() && history.location.pathname === "/notes/" + id)
        documentPane.current?.querySelector<HTMLElement>(selector)?.focus();
    };
    renderDraft();
  }
  useEffect(() => {
    if (nextFocus.current) requestAnimationFrame(nextFocus.current);
    nextFocus.current = undefined;
  });

  function endAction() {
    command.current = undefined;
    setPanel(undefined);
    refreshList();
  }

  function missing(note: NoteDraft) {
    endAction();
    if (note.dirty) {
      note.unavailable();
      focusInDocument("[data-recovery] button", note.id);
    } else {
      note.dispose();
      active.current = undefined;
      setFailedId(note.id);
      focusInDocument('[aria-label="Back"]', note.id);
    }
  }

  function acknowledged(cmd: NoteCommand, note: NoteDraft, row: NoteState) {
    if (cmd.destination) {
      if (!note.adoptMove(row)) throw Error("Baseline changed.");
      endAction();
      announce(
        "Moved to " +
          (folders.find((f) => f.id === row.folder)?.name ?? "folder") +
          ".",
      );
      focusInDocument('[role="textbox"]', note.id);
    } else if (note.dirty) missing(note);
    else {
      endAction();
      announce("Note moved to Recently Deleted.");
      note.dispose();
      active.current = undefined;
      if (origin?.fromList && history.canGoBack()) {
        returning.current = { ...origin, focus: "" };
        history.back({ ignoreBlocker: true });
      } else
        void selectFolder(
          origin?.folder ?? cmd.originalFolder,
          { page, q, sp },
          true,
          true,
          true,
        );
    }
  }

  async function checkAction() {
    const cmd = command.current;
    if (!cmd || !panel || checking.current) return;
    const view = { ...panel, destination: cmd.destination };
    const note = active.current;
    const stillHere = () =>
      note?.current &&
      active.current === note &&
      note.id === cmd.id &&
      history.location.pathname === "/notes/" + cmd.id;
    const entry = history.location.state.__TSR_key;
    checking.current = true;
    setPanel({ ...view, phase: "checking" });
    try {
      const row = await readCommand(cmd, session);
      if (!session.current() || command.current !== cmd) return;
      if (!note || !stillHere()) {
        if (active.current?.id === cmd.id)
          setPanel({ ...view, phase: "closed" });
        else endAction();
        return;
      }
      if (!cmd.refused && row && confirms(row, cmd))
        acknowledged(cmd, note, row);
      else if (!row || row.deleted) missing(note);
      else if (
        !cmd.refused &&
        row.revision === cmd.revision &&
        row.folder === cmd.originalFolder
      ) {
        command.current = undefined;
        note.resume();
        setPanel({ ...view, phase: "choose" });
      } else if (note.dirty) {
        endAction();
        note.changedElsewhere();
      } else {
        const latest = await getNote(cmd.id, session);
        if (!stillHere() || command.current !== cmd) return;
        note.replaceSaved(latest);
        setPinState({ id: latest.id, pinned: !!latest.pinned });
        endAction();
        focusInDocument(
          note.dirty ? "[data-recovery] button" : "#note-actions",
          cmd.id,
        );
      }
    } catch {
      if (session.current() && command.current === cmd)
        setPanel({
          ...view,
          phase: "retry",
          quiet: entry !== history.location.state.__TSR_key,
        });
    } finally {
      checking.current = false;
    }
  }

  function submitAction(destination?: string) {
    if (
      !draft ||
      !panel ||
      pending.current ||
      command.current ||
      panel.phase !== "choose"
    )
      return;
    setPanel({ ...panel, phase: "sending", destination });
    void guard(false, send, true);
    async function send() {
      if (!draft || !panel) return;
      if (!draft.current || active.current !== draft) return;
      const cmd = {
        id: draft.id,
        user,
        originalFolder: draft.folder,
        revision: draft.revision,
        destination,
      };
      command.current = cmd;
      draft.pause();
      try {
        const row = await sendCommand(cmd, session);
        if (draft.current && active.current === draft)
          acknowledged(cmd, draft, row);
      } catch (error) {
        if (!draft.current || command.current !== cmd) return;
        const status = error instanceof ClientResponseError ? error.status : 0;
        if (status === 409 || status === 404) {
          command.current.refused = true;
          await checkAction();
        } else if (status === 400 && destination) {
          let message = "Choose a different available folder.";
          try {
            const rows = await listFolders();
            if (!draft.current || active.current !== draft) return;
            setFolders(rows);
          } catch {
            message = "Could not reload folders. Cancel and try again.";
          }
          if (!draft.current) return;
          command.current = undefined;
          draft.resume();
          setPanel({ verb: "move", phase: "choose", error: message });
          requestAnimationFrame(() => {
            if (draft.current)
              document.querySelector<HTMLElement>("[data-cancel]")?.focus();
          });
        } else setPanel({ ...panel, phase: "uncertain", destination });
      }
    }
  }

  async function togglePin(pinned: boolean) {
    const note = active.current;
    if (!note || pin?.id !== note.id || pin.busy) return;
    const before = pin.pinned;
    const here = () => note.current && active.current === note;
    setPinState({ id: note.id, pinned: before, busy: true });
    try {
      await setPin(note.id, user, pinned, session);
      if (!here()) return;
      setPinState({ id: note.id, pinned });
      refreshList();
      announce(pinned ? "Pinned." : "Unpinned.");
      focusInDocument("#note-actions", note.id);
    } catch (error) {
      if (!here()) return;
      const status = responseStatus(error);
      if (status === 404) {
        setPinState({ id: note.id, pinned: before });
        missing(note);
      } else if (status === 400) {
        try {
          const latest = await getNote(note.id, session);
          if (here()) setPinState({ id: note.id, pinned: !!latest.pinned });
        } catch {
          if (here()) missing(note);
        }
      } else setPinState({ id: note.id, pinned: before, retry: pinned });
    }
  }

  async function followRemote(next?: Notice) {
    const note = active.current;
    const notice = next ?? kept.current;
    if (!notice || !note?.current || notice.id !== note.id) {
      if (!next) kept.current = undefined;
      return;
    }
    kept.current = undefined;
    if (note.isEcho(notice, pin?.id === note.id ? pin.pinned : undefined))
      return;
    if (
      note.busy ||
      reading.current ||
      pin?.busy ||
      command.current ||
      pending.current ||
      note.failure === "conflict" ||
      note.failure === "unavailable"
    ) {
      kept.current = notice;
      return;
    }
    reading.current = true;
    const hadFocus = !!documentPane.current
      ?.querySelector('[role="textbox"]')
      ?.contains(document.activeElement);
    // Without the pause an autosave could send the old revision mid-read.
    note.pause();
    try {
      const latest = await getNote(note.id, session);
      if (active.current !== note || !note.current) return;
      if (command.current || pending.current) {
        kept.current ??= notice;
        return;
      }
      const result = note.remote(latest);
      setPinState((state) =>
        state?.id === note.id && state.busy
          ? state
          : { id: note.id, pinned: !!latest.pinned },
      );
      if (result === "replaced") {
        announce("Updated from another device.");
        if (hadFocus) focusInDocument('[role="textbox"]', note.id);
      }
    } catch (error) {
      if (active.current !== note || !note.current) return;
      if (
        (error instanceof NoteAccessError && error.reason === "unavailable") ||
        responseStatus(error) === 404
      )
        missing(note);
    } finally {
      reading.current = false;
      if (active.current === note && !command.current && !pending.current)
        note.resume();
      renderDraft();
    }
  }
  useLayoutEffect(() => {
    follow.current = followRemote;
  });
  // Re-check a kept notice once the save, action, pin or choice that held it ends.
  useEffect(() => {
    if (kept.current) void followRemote();
  });

  const controls = (
    <NoteActions
      draft={draft}
      folders={folders}
      panel={pending.current?.choosing ? undefined : panel}
      choose={(verb) => setPanel({ verb, phase: "choose" })}
      dismiss={dismissAction}
      submit={submitAction}
      check={checkAction}
      blocked={!!pending.current || !!command.current}
      pin={pin?.id === draft?.id ? pin : undefined}
      onPin={(pinned) => void togglePin(pinned)}
    />
  );
  const pane = "min-h-0 min-w-0 flex-col md:flex";
  return (
    <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
      <main className="grid h-full w-full min-w-0 grid-cols-1 md:grid-cols-[clamp(170px,18vw,255px)_clamp(220px,24vw,340px)_minmax(0,1fr)]">
        <section
          aria-label="Folders"
          className={cn(
            pane,
            "md:border-r",
            !selected && !folderId ? "flex" : "hidden",
          )}
        >
          <FolderList
            folders={folders}
            selected={folder}
            error={folderError}
            revisitTrash={(event) => {
              if (
                !isTrash ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              if (page > 1) void selectFolder("recently-deleted", {}, true);
              else refreshTrash();
            }}
            onCreated={(item) => {
              if (pb.authStore.record?.id !== item.user) return;
              setFolders((rows) =>
                [...rows, item].sort(
                  (a, b) =>
                    Number(b.is_default) - Number(a.is_default) ||
                    a.name.localeCompare(b.name),
                ),
              );
              void selectFolder(item.id);
            }}
          />
        </section>
        <section
          aria-label="Note list"
          className={cn(
            pane,
            "relative md:border-r",
            !selected && folderId ? "flex" : "hidden",
          )}
        >
          <RecentlyDeleted
            visible={isTrash && !selected}
            session={session}
            user={user}
            folders={folders}
            refresh={trashRefresh}
            onRestored={refreshList}
          />
          {!isTrash && (
            <NoteList
              key={JSON.stringify([user, folder, page, q, sp])}
              user={user}
              folders={folders}
              q={q}
              sp={sp}
              entryKey={locationState.__TSR_key}
              focusSearch={!!locationState.focusSearch}
              choosing={!!pending.current?.choosing}
              fromList={!!q && !!origin?.fromList}
              folder={folder}
              title={
                folder === "all"
                  ? "All Notes"
                  : folder === "pinned"
                    ? "Pinned"
                    : (folderRecord?.name ?? "Folder")
              }
              page={page}
              selected={selected}
              refresh={refresh}
              compose={compose}
              canCompose={!!target}
              deletingFolder={deletions.some((item) => item.id === folderId)}
              deleteFolder={
                !selected &&
                folderId &&
                !q &&
                folderRecord &&
                !folderRecord.is_default
                  ? () =>
                      setDeletions((items) =>
                        items.some((item) => item.id === folderId)
                          ? items
                          : [...items, folderRecord],
                      )
                  : undefined
              }
              position={returning.current}
              showingList={!selected && !!folderId}
              onPage={(next) => selectFolder(folder, { page: next })}
              onSearch={(term, next) =>
                selectFolder(
                  folder,
                  { page, q: term, sp: next },
                  !selected,
                  true,
                )
              }
              clampPage={(next) => {
                if (noteId && origin) {
                  void navigate({
                    to: "/notes/$noteId",
                    params: { noteId },
                    replace: true,
                    state: { origin: { ...origin, [q ? "sp" : "page"]: next } },
                    ignoreBlocker: true,
                  });
                } else
                  void selectFolder(
                    folder,
                    { page: q ? page : next, q, sp: q ? next : sp },
                    true,
                    true,
                  );
              }}
            />
          )}
        </section>
        <section
          ref={documentPane}
          aria-label="Document"
          className={cn(pane, selected ? "flex" : "hidden")}
        >
          {!isTrash && (
            <NoteEditor
              draft={draft}
              readError={readError ? retryDetail : undefined}
              actions={selected && controls}
              selected={!!selected}
              unavailable={!!selected && failedId === selected}
              back={back}
            />
          )}
        </section>
      </main>
      <span role="status" className="sr-only">
        {notice}
      </span>
      <div
        id="action-statuses"
        className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 flex-col gap-2"
      />
      {deletions.map((deleting) => (
        <DeleteFolder
          key={deleting.id}
          folder={deleting}
          session={session}
          user={user}
          cancel={() =>
            setDeletions((items) => items.filter((item) => item !== deleting))
          }
          gone={(message, focus) => {
            setFolders((rows) => rows.filter((row) => row.id !== deleting.id));
            setDeletions((items) => items.filter((item) => item !== deleting));
            refreshList();
            announce(message);
            if (!focus) return;
            if (history.location.pathname === "/folders/" + deleting.id)
              void selectFolder("all", {}, true, true, true);
            else
              document
                .querySelector<HTMLInputElement>('input[type="search"]')
                ?.focus();
          }}
        />
      ))}
      {!selected && panel && (
        <aside className="fixed top-2 right-2 rounded-md border bg-background p-2">
          {controls}
        </aside>
      )}
      {pending.current?.choosing && draft && (
        <LeaveDialog
          draft={draft}
          signOut={pending.current.signOut}
          cancel={cancel}
          save={() => void finish(true)}
          discard={() => void finish(false)}
          focusEditor={() =>
            documentPane.current
              ?.querySelector<HTMLElement>('[role="textbox"]')
              ?.focus()
          }
        />
      )}
    </SidebarProvider>
  );
}
