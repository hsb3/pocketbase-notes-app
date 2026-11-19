import { pb } from "@/services/pocketbase";
import type { NoteDraft } from "./draft";

const drafts = new Map<string, ReturnType<NoteDraft["suspend"]>>();

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!pb.authStore.isValid || drafts.has(pb.authStore.record?.id ?? "")) {
    event.preventDefault();
    event.returnValue = "";
  }
}

export function parkDraft(draft: NoteDraft) {
  if (draft.dirty) {
    drafts.set(draft.user, draft.suspend());
    window.addEventListener("beforeunload", warnBeforeUnload);
  } else draft.dispose();
}

export function heldDraft(user: string) {
  return drafts.get(user);
}

export function forgetDraft(user: string) {
  drafts.delete(user);
  if (!drafts.size)
    window.removeEventListener("beforeunload", warnBeforeUnload);
}

export function hasHeldDraft() {
  return drafts.size > 0;
}
