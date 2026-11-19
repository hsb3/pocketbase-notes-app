import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { NoteDraft } from "./draft";

export function LeaveDialog({
  draft,
  signOut,
  cancel,
  save,
  discard,
  focusEditor,
}: {
  draft: NoteDraft;
  signOut: boolean;
  cancel: () => void;
  save: () => void;
  discard: () => void;
  focusEditor: () => void;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusEditor();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {signOut ? "Sign out with unsaved edits?" : "Leave this note?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {draft.failure === "conflict"
              ? "Keep editing to review the conflict, or discard the local edits."
              : draft.failure === "unavailable"
                ? "Keep editing to copy the draft, or discard the local edits."
                : "Save the edits before leaving, discard them, or keep editing."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {draft.error && <p role="status">{draft.error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <Button variant="destructive" disabled={draft.busy} onClick={discard}>
            Discard
          </Button>
          <AlertDialogAction
            disabled={
              draft.busy ||
              draft.failure === "conflict" ||
              draft.failure === "unavailable"
            }
            onClick={(event) => {
              event.preventDefault();
              save();
            }}
          >
            Save and continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
