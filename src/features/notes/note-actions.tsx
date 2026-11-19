import { useLayoutEffect, useRef } from "react";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { listFolders } from "@/features/folders/data";
import type { NoteDraft } from "./draft";

export type ActionPanel = {
  verb: "move" | "delete";
  phase: "choose" | "sending" | "uncertain" | "closed" | "checking" | "retry";
  destination?: string;
  error?: string;
  quiet?: boolean;
};

export function NoteActions({
  draft,
  folders,
  panel,
  choose,
  dismiss,
  submit,
  check,
  blocked,
}: {
  draft?: NoteDraft;
  folders: Awaited<ReturnType<typeof listFolders>>;
  panel?: ActionPanel;
  choose: (verb: ActionPanel["verb"]) => void;
  dismiss: () => void;
  submit: (folder?: string) => void;
  check: () => void;
  blocked: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const statusButton = useRef<HTMLButtonElement>(null);
  const phase = panel?.phase;
  const uncertain = phase === "uncertain";
  const sending = phase === "sending";
  const modal = phase === "choose" || sending;

  useLayoutEffect(() => {
    if (
      !panel?.quiet &&
      (phase === "retry" || phase === "closed" || phase === "uncertain")
    )
      statusButton.current?.focus();
  }, [phase, panel?.quiet]);
  const handoff = useRef(false);
  function show(verb: ActionPanel["verb"]) {
    handoff.current = true;
    choose(verb);
  }
  const cancel = () => {
    dismiss();
    trigger.current?.focus();
  };
  const suppress = (e: Event) => e.preventDefault();
  return (
    <>
      {draft && draft.revision > 0 && draft.failure !== "unavailable" && (
        <>
          <span className="max-w-28 truncate text-xs text-muted-foreground">
            {folders.find((f) => f.id === draft.folder)?.name}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={trigger}
                id="note-actions"
                variant="ghost"
                size="icon"
                aria-label="Note actions"
                disabled={blocked || !!panel}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(e) => {
                if (handoff.current) e.preventDefault();
                handoff.current = false;
              }}
            >
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => show("move")}>
                  Move…
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => show("delete")}
                >
                  Delete note…
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      {panel?.verb === "move" && modal && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open && !sending) cancel();
          }}
        >
          <SheetContent
            showCloseButton={!sending}
            onCloseAutoFocus={suppress}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              const root = e.currentTarget as HTMLElement;
              const target = panel.destination
                ? `[data-folder="${panel.destination}"]:enabled`
                : "[data-folder]:enabled";
              const first =
                !panel.error && root.querySelector<HTMLButtonElement>(target);
              (
                first || root.querySelector<HTMLButtonElement>("[data-cancel]")
              )?.focus();
            }}
          >
            <SheetHeader>
              <SheetTitle>Move note</SheetTitle>
              <SheetDescription>
                {sending
                  ? "Moving note…"
                  : `Choose a folder for ${draft?.title}.`}
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-col gap-1 overflow-y-auto px-4 py-1">
              {folders.map((f) => (
                <Button
                  key={f.id}
                  data-folder={f.id}
                  variant="ghost"
                  className="h-auto min-h-10 justify-start text-left break-all whitespace-normal"
                  disabled={sending || f.id === draft?.folder}
                  onClick={() => submit(f.id)}
                >
                  {f.name}
                  {f.id === draft?.folder && " (current)"}
                </Button>
              ))}
            </div>
            {panel.error && (
              <p role="alert" className="px-4">
                {panel.error}
              </p>
            )}
            <Button
              variant="outline"
              className="mx-4"
              data-cancel=""
              disabled={sending}
              onClick={cancel}
            >
              Cancel
            </Button>
          </SheetContent>
        </Sheet>
      )}
      {(uncertain || (panel?.verb === "delete" && modal)) && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !sending) {
              if (uncertain) dismiss();
              else cancel();
            }
          }}
        >
          <AlertDialogContent
            onCloseAutoFocus={suppress}
            onOpenAutoFocus={(e) => {
              if (uncertain) {
                e.preventDefault();
                statusButton.current?.focus();
              }
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                {uncertain ? "Check note action" : `Delete ${draft?.title}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {uncertain
                  ? "The reply was interrupted. Check the saved note before trying again."
                  : "Recover this note from Recently Deleted for 30 days."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {uncertain ? (
                <>
                  <Button ref={statusButton} onClick={check}>
                    Check again
                  </Button>
                  <Button variant="outline" onClick={dismiss}>
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <AlertDialogCancel disabled={sending}>
                    Cancel
                  </AlertDialogCancel>
                  <Button
                    variant="destructive"
                    disabled={sending}
                    onClick={() => submit()}
                  >
                    {sending ? "Deleting note…" : "Delete note"}
                  </Button>
                </>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {(phase === "closed" || phase === "checking" || phase === "retry") && (
        <div className="flex items-center gap-2 text-xs">
          <span role="status">
            {phase === "retry"
              ? "Could not verify the saved note."
              : phase === "checking"
                ? "Checking saved note…"
                : "Note action unconfirmed."}
          </span>
          <Button
            size="sm"
            ref={statusButton}
            variant="outline"
            disabled={phase === "checking"}
            onClick={check}
          >
            {phase === "retry" ? "Retry" : "Check again"}
          </Button>
        </div>
      )}
    </>
  );
}
