import { useState } from "react";
import type { NodeJSON } from "prosekit/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { NoteDraft } from "./draft";

function words(node: NodeJSON): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "mention") return node.attrs?.value ?? "";
  if (node.type === "hardBreak") return "\n";
  const inline = [
    "paragraph",
    "heading",
    "codeBlock",
    "mathBlock",
    "mathInline",
  ].includes(node.type ?? "");
  return node.content?.map(words).join(inline ? "" : "\n") ?? "";
}

export function ConflictDialog({
  draft,
  focusEditor,
}: {
  draft: NoteDraft;
  focusEditor: () => void;
}) {
  const [screen, setScreen] = useState<"closed" | "review" | "confirm">(
    draft.failure === "conflict" ? "review" : "closed",
  );
  const [copyStatus, setCopyStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const conflict = draft.failure === "conflict";

  function close() {
    setCopyStatus("");
    setScreen("closed");
  }
  function restoreFocus(event: Event) {
    event.preventDefault();
    if (
      !document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      )
    )
      focusEditor();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(words(draft.body));
      setCopyStatus("Draft copied.");
    } catch {
      setScreen("closed");
      setCopyStatus(
        "Copy was blocked. Select the writing in the editor and copy it manually.",
      );
    }
  }

  return (
    <>
      {screen === "closed" && copyStatus && (
        <span role="status" aria-label="Copy draft" className="text-xs">
          {copyStatus}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setCopyStatus("");
          if (conflict) setScreen("review");
          else void copy();
        }}
      >
        {conflict ? "Review conflict" : "Copy draft"}
      </Button>
      {screen === "review" && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogContent
            showCloseButton={false}
            onCloseAutoFocus={restoreFocus}
          >
            <DialogHeader>
              <DialogTitle>
                {conflict ? "Save conflict" : "Saved note unavailable"}
              </DialogTitle>
              <DialogDescription>
                {conflict
                  ? "The saved version differs from your unsaved edits. Copy this draft before replacing it."
                  : "Your unsaved words are still in this tab. Copy them to keep them."}
              </DialogDescription>
            </DialogHeader>
            <p role="status" aria-label="Draft recovery">
              {copyStatus || draft.error}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => void copy()}>
                Copy draft
              </Button>
              {conflict && (
                <Button onClick={() => setScreen("confirm")}>
                  Reload saved
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {screen === "confirm" && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) close();
          }}
        >
          <AlertDialogContent
            onCloseAutoFocus={restoreFocus}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Replace this draft?</AlertDialogTitle>
              <AlertDialogDescription>
                Reloading the current saved version will replace the unsaved
                words in this tab.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  if (!(await draft.reloadSaved())) close();
                  setBusy(false);
                }}
              >
                Reload saved
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
