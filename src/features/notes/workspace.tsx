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
import { FolderList } from "@/features/folders/folder-list";
import { pb } from "@/services/pocketbase";
import { cn } from "@/utils/classnames";
import { ClientResponseError, getTokenPayload } from "pocketbase";
import { heldDraft, forgetDraft, parkDraft } from "./suspended-draft";
import { getNote, ownerSession, verifyOwner, NoteAccessError } from "./data";
import { NoteDraft } from "./draft";
import { LeaveDialog } from "./leave-dialog";
import { NoteEditor } from "./note-editor";
import { NoteList, type ListPosition } from "./note-list";

declare module "@tanstack/react-router" {
  interface HistoryState {
    origin?: ListPosition;
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
  const origin = useLocation({ select: (location) => location.state.origin });
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
  }>(undefined);
  const documentPane = useRef<HTMLElement>(null);
  const [opening, setOpening] = useState<string>();
  const [failedId, setFailedId] = useState<string>();
  const selected = opening ?? noteId;
  const draft = active.current?.id === selected ? active.current : undefined;
  const folder = folderId ?? origin?.folder ?? draft?.folder ?? "all";
  const page = folderId ? (search.page ?? 1) : (origin?.page ?? 1);
  const folderRecord = folders.find((item) => item.id === folder);
  const target =
    folder === "all" ? folders.find((item) => item.is_default) : folderRecord;

  useEffect(() => {
    let current = true;
    listFolders()
      .then((rows) => {
        if (!current) return;
        defaultFolder(rows, user);
        setFolders(rows);
      })
      .catch(() => {
        if (current) setFolderError("Could not load the notebook folders.");
      });
    return () => {
      current = false;
    };
  }, [user]);

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

  useEffect(() => {
    let current = true;
    setOpening(undefined);
    setFailedId(undefined);
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
            renderDraft();
          })
          .catch(() => {
            if (current && session.current()) setFailedId(noteId);
          });
    }
    return () => {
      current = false;
    };
  }, [noteId, user, session, makeDraft, active]);

  const guard = useCallback(
    async (signOut: boolean, proceed: () => void) => {
      if (pending.current || !session.current()) return;
      const note = active.current;
      if (!note?.dirty) return proceed();
      const intent = { note, proceed, signOut, choosing: false };
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
              noteId && origin && path === "/folders/" + origin.folder
                ? origin
                : undefined;
          };
          if (pending.current) return true;
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
    [history, active, guard, noteId, origin],
  );

  function cancel() {
    const intent = pending.current;
    pending.current = undefined;
    intent?.note.resume();
    renderDraft();
  }

  async function finish(save: boolean) {
    const intent = pending.current;
    if (!intent || intent.note.busy || !intent.note.current) return;
    const { note } = intent;
    if (save) {
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
    pending.current = undefined;
    note.dispose();
    active.current = undefined;
    renderDraft();
    intent.proceed();
  }

  function selectFolder(id: string, page = 1, replace = false) {
    return navigate({
      to: "/folders/$folderId",
      params: { folderId: id },
      search: page > 1 ? { page } : {},
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
    } else void selectFolder(folder, page, true);
  }

  function compose(from: ListPosition) {
    if (!target) return;
    const open = () => {
      active.current?.dispose();
      const next = makeDraft(target.id);
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
          <NoteList
            key={folder + ":" + page}
            folder={folder}
            title={
              folder === "all" ? "All Notes" : (folderRecord?.name ?? "Folder")
            }
            page={page}
            selected={selected}
            refresh={refresh}
            compose={compose}
            canCompose={!!target}
            position={origin ?? returning.current}
            showingList={!selected && !!folderId}
            onPage={(next) => selectFolder(folder, next)}
          />
        </section>
        <section
          ref={documentPane}
          aria-label="Document"
          className={cn(pane, selected ? "flex" : "hidden")}
        >
          <NoteEditor
            draft={draft}
            selected={!!selected}
            unavailable={!!selected && failedId === selected}
            back={back}
          />
        </section>
      </main>
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
