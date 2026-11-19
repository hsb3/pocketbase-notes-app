import {
  useBlocker,
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
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { defaultFolder, listFolders } from "@/features/folders/data";
import { FolderList } from "@/features/folders/folder-list";
import { pb } from "@/services/pocketbase";
import { cn } from "@/utils/classnames";
import { getNote } from "./data";
import { NoteDraft } from "./draft";
import { NoteEditor } from "./note-editor";
import { NoteList, type ListPosition } from "./note-list";

declare module "@tanstack/react-router" {
  interface HistoryState {
    origin?: ListPosition;
  }
}

const subscribe = (update: () => void) => pb.authStore.onChange(update);
export function Workspace() {
  const user = useSyncExternalStore(subscribe, () => pb.authStore.record?.id);
  return user ? (
    <Library key={user} user={user} />
  ) : (
    <p>Sign in to open notes.</p>
  );
}

function Library({ user }: { user: string }) {
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
  const active = useRef<NoteDraft>(undefined);
  const returning = useRef<ListPosition>(undefined);
  const backPending = useRef(false);
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
    (folder: string, note?: Awaited<ReturnType<typeof getNote>>) =>
      new NoteDraft({
        user,
        folder,
        note,
        onChange: renderDraft,
        onSaved: refreshList,
      }),
    [user],
  );

  useEffect(() => () => active.current?.dispose(), []);
  useEffect(() => {
    let current = true;
    setOpening(undefined);
    setFailedId(undefined);
    if (active.current?.id !== noteId) {
      active.current?.dispose();
      active.current = undefined;
      if (noteId)
        getNote(noteId)
          .then((note) => {
            if (!current || pb.authStore.record?.id !== user) return;
            active.current = makeDraft(note.folder, note);
            renderDraft();
          })
          .catch(() => {
            if (current) setFailedId(noteId);
          });
    }
    return () => {
      current = false;
    };
  }, [noteId, user, makeDraft]);

  useBlocker({
    enableBeforeUnload: false,
    shouldBlockFn: async ({ next }) => {
      const note = active.current;
      if (
        note &&
        next.pathname !== "/notes/" + note.id &&
        !(await note.flush())
      )
        return true;
      if (noteId && origin && next.pathname === "/folders/" + origin.folder)
        returning.current = origin;
      else if (next.pathname !== "/notes/" + noteId)
        returning.current = undefined;
      return false;
    },
  });

  function selectFolder(id: string, page = 1, replace = false) {
    return navigate({
      to: "/folders/$folderId",
      params: { folderId: id },
      search: page > 1 ? { page } : {},
      replace,
    });
  }
  async function back() {
    if (backPending.current) return;
    backPending.current = true;
    try {
      if (origin?.fromList && history.canGoBack()) {
        if (!draft || (await draft.flush())) history.back();
      } else {
        await selectFolder(folder, page, true);
      }
    } finally {
      backPending.current = false;
    }
  }
  async function compose(from: ListPosition) {
    if (!target || (active.current && !(await active.current.flush()))) return;
    active.current?.dispose();
    const next = makeDraft(target.id);
    // Mount the warmed editor and focus it in the tap before starting the URL change.
    flushSync(() => {
      active.current = next;
      setOpening(next.id);
    });
    await navigate({
      to: "/notes/$noteId",
      params: { noteId: next.id },
      state: { origin: from },
    });
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
    </SidebarProvider>
  );
}
