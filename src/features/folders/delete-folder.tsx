import { useRouter } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  checkFolder,
  deleteFolder,
  folderPreview,
  responseStatus,
  type Session,
} from "@/features/notes/actions";
import {
  ActionCheck,
  type CheckPhase,
} from "@/features/notes/recently-deleted";

type Preview = Awaited<ReturnType<typeof folderPreview>>;

export function DeleteFolder({
  folder,
  session,
  user,
  cancel,
  gone,
}: {
  folder: { id: string; name: string };
  session: Session;
  user: string;
  cancel: () => void;
  gone: (message: string, focus: boolean) => void;
}) {
  const { history } = useRouter();
  const [phase, setPhase] = useState<"preview" | "sending" | CheckPhase>(
    "preview",
  );
  const [preview, setPreview] = useState<Preview>();
  const [problem, setProblem] = useState("");
  const [changed, setChanged] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const working = useRef(false);
  const restoreTrigger = useRef(false);
  const [quiet, setQuiet] = useState(false);
  useLayoutEffect(() => {
    if (phase === "preview") cancelButton.current?.focus();
  }, [phase]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: An explicit retry requests a new snapshot.
  useEffect(() => {
    if (phase !== "preview") return;
    let live = true;
    folderPreview(folder.id, session).then(
      (data) => {
        if (live && session.current()) setPreview(data);
      },
      () => {
        if (live && session.current())
          setProblem("Could not load this folder’s deletion preview.");
      },
    );
    return () => {
      live = false;
    };
  }, [folder.id, session, phase, attempt]);

  useLayoutEffect(() => {
    if (phase !== "sending" && phase !== "uncertain" && phase !== "preview")
      return;
    return history.block({ blockerFn: () => true, enableBeforeUnload: false });
  }, [history, phase]);

  const entry = () => history.location.state.__TSR_key;
  const onFolder = () => history.location.pathname === "/folders/" + folder.id;
  function newPreview(wasChanged: boolean) {
    setPreview(undefined);
    setProblem("");
    setChanged(wasChanged);
    setPhase("preview");
    setAttempt((n) => n + 1);
    cancelButton.current?.focus();
  }
  async function check() {
    const key = entry();
    setQuiet(false);
    setPhase("checking");
    try {
      const present = await checkFolder(folder.id, user, session);
      if (!session.current()) return;
      const sameEntry = key === entry();
      if (!present)
        gone(
          "Folder is no longer available.",
          sameEntry &&
            (onFolder() || history.location.pathname === "/folders/all"),
        );
      else if (sameEntry) newPreview(false);
      else cancel();
    } catch {
      if (session.current()) {
        setQuiet(key !== entry());
        setPhase("retry");
      }
    }
  }

  async function confirm() {
    if (!preview || working.current || !session.current()) return;
    working.current = true;
    setPhase("sending");
    try {
      await deleteFolder(preview, session);
      if (session.current()) gone("Folder deleted.", onFolder());
    } catch (error) {
      if (!session.current()) return;
      const status = responseStatus(error);
      if (status === 409) newPreview(true);
      else if (status === 404) await check();
      else setPhase("uncertain");
    } finally {
      working.current = false;
    }
  }
  if (phase !== "preview" && phase !== "sending")
    return (
      <ActionCheck
        phase={phase}
        subject={`deletion of “${folder.name}”`}
        quiet={quiet}
        close={() => setPhase("closed")}
        check={() => void check()}
      />
    );
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && phase === "preview") {
          restoreTrigger.current = true;
          cancel();
        }
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (restoreTrigger.current && session.current() && onFolder())
            document.getElementById("delete-folder")?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="wrap-anywhere">
            Delete {preview?.name ?? folder.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {preview
              ? `${preview.activeCount} active ${preview.activeCount === 1 ? "note" : "notes"}. `
              : ""}
            The folder will be permanently removed. Its active notes can be
            restored to Notes from Recently Deleted for 30 days.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {changed && (
          <p className="text-sm" role="status">
            The folder changed. Review the updated count before confirming
            again.
          </p>
        )}
        {problem ? (
          <div role="alert">
            {problem}{" "}
            <Button
              variant="outline"
              size="sm"
              onClick={() => newPreview(changed)}
            >
              Retry
            </Button>
          </div>
        ) : (
          !preview && <p role="status">Loading preview…</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelButton} disabled={phase === "sending"}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            className="bg-[color-mix(in_srgb,hsl(var(--destructive))_78%,black)] hover:bg-[color-mix(in_srgb,hsl(var(--destructive))_70%,black)]"
            disabled={!preview || phase === "sending"}
            onClick={() => void confirm()}
          >
            {phase === "sending" ? "Deleting folder…" : "Delete folder"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
