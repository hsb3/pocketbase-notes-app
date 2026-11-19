import { ClientResponseError } from "pocketbase";
import type { NodeJSON } from "prosekit/core";
import { saveNote } from "./data";

type SavedNote = Awaited<ReturnType<typeof saveNote>>;
type Status = "Idle" | "Pending" | "Saving" | "Saved" | "Error";
type Options = {
  user: string;
  folder: string;
  note?: SavedNote;
  onChange?: () => void;
  onSaved?: (note: SavedNote) => void;
};

function hasContent(node: NodeJSON): boolean {
  return (
    node.type === "image" ||
    Boolean(node.text?.trim()) ||
    (node.type === "mention" && Boolean(node.attrs?.value?.trim())) ||
    Boolean(node.content?.some(hasContent))
  );
}

export class NoteDraft {
  readonly id: string;
  readonly user: string;
  readonly folder: string;
  body: NodeJSON;
  revision: number;
  status: Status;
  error = "";
  private generation = 0;
  private acknowledged = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;
  private leaving = false;
  private retryable = false;
  private disposed = false;

  constructor(private options: Options) {
    const { note, user, folder } = options;
    if (
      !user ||
      !folder ||
      (note && (note.user !== user || note.folder !== folder))
    )
      throw new Error("Note unavailable.");
    this.user = user;
    this.folder = folder;
    this.id =
      note?.id ??
      Array.from(crypto.getRandomValues(new Uint8Array(15)), (byte) =>
        (byte % 36).toString(36),
      ).join("");
    this.body = note?.body ?? { type: "doc", content: [{ type: "paragraph" }] };
    this.revision = note?.revision ?? 0;
    this.status = note ? "Saved" : "Idle";
  }

  edit(body: NodeJSON) {
    if (this.disposed) return;
    this.body = body;
    this.generation++;
    this.clearTimer();
    if (!this.error) {
      this.status = "Pending";
      if (!this.leaving)
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.pump();
        }, 500);
    }
    this.options.onChange?.();
  }

  flush(): Promise<boolean> {
    this.clearTimer();
    this.leaving = true;
    return this.pump();
  }

  // Only an explicitly rejected validation attempt can be repeated without reconciliation.
  retry(): Promise<boolean> {
    if (!this.retryable) return Promise.resolve(false);
    this.retryable = false;
    this.error = "";
    return this.flush();
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private pump(): Promise<boolean> {
    if (!this.running) {
      this.running = Promise.resolve().then(async () => {
        try {
          while (
            !this.disposed &&
            !this.error &&
            !this.timer &&
            this.acknowledged !== this.generation
          ) {
            const generation = this.generation;
            const body = structuredClone(this.body);
            if (this.revision === 0 && !hasContent(body)) {
              this.acknowledged = generation;
              this.status = "Idle";
              this.options.onChange?.();
              continue;
            }
            this.status = "Saving";
            this.options.onChange?.();
            const note = await saveNote(
              this.user,
              this.folder,
              this.id,
              body,
              this.revision,
            );
            if (this.disposed) return false;
            this.acknowledged = generation;
            this.revision = note.revision;
            this.status = this.generation === generation ? "Saved" : "Pending";
            this.options.onSaved?.(note);
            this.options.onChange?.();
          }
          return (
            !this.disposed &&
            !this.error &&
            this.acknowledged === this.generation
          );
        } catch (error) {
          if (!this.disposed) {
            this.clearTimer();
            this.retryable =
              error instanceof ClientResponseError &&
              error.status === 400 &&
              Boolean(error.response.data?.body?.code) &&
              !error.response.data?.id;
            this.error =
              "Unable to save this note. " +
              (error instanceof Error ? error.message : String(error));
            this.status = "Error";
            this.options.onChange?.();
          }
          return false;
        } finally {
          this.leaving = false;
          this.running = undefined;
        }
      });
    }
    return this.running;
  }
}
