import { ClientResponseError } from "pocketbase";
import type { NodeJSON } from "prosekit/core";
import {
  equalJSON,
  getNote,
  matchesNote,
  NoteAccessError,
  ownerSession,
  saveNote,
  verifyOwner,
} from "./data";

import type { NoteState } from "./actions";
import type { Notice } from "./live";

type SavedNote = Awaited<ReturnType<typeof saveNote>>;
type Submission = Pick<
  SavedNote,
  "id" | "user" | "folder" | "body" | "attachments" | "revision"
> & { generation: number };
type Status = "Idle" | "Pending" | "Saving" | "Saved" | "Error";
type Failure = "retry" | "invalid" | "locked" | "conflict" | "unavailable";
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

function statusOf(error: unknown) {
  return error instanceof ClientResponseError ? error.status : 0;
}

export class NoteDraft {
  readonly id: string;
  readonly user: string;
  private readonly initialFolder: string;
  body: NodeJSON;
  status: Status;
  error = "";
  editorVersion = 0;
  failure?: Failure;
  private readonly session: ReturnType<typeof ownerSession>;
  private baseline?: SavedNote;
  private submissions: Submission[] = [];
  private rejection?: "collision" | "denied" | "bad-create" | "stale";
  private generation = 0;
  private acknowledged = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;
  private leaving = false;
  private paused = false;
  private disposed = false;

  constructor(
    private options: Options,
    held?: ReturnType<NoteDraft["suspend"]>,
  ) {
    const { note, user, folder } = options;
    if (
      !user ||
      !folder ||
      (note && (note.user !== user || note.folder !== folder || note.deleted))
    )
      throw new Error("Note unavailable.");
    this.user = user;
    this.initialFolder = folder;
    this.session = ownerSession(user);
    if (
      held &&
      (held.user !== user || held.folder !== folder || !this.session.current())
    )
      throw new Error("Note unavailable.");
    this.baseline = held?.baseline ?? note;
    this.id =
      held?.id ??
      note?.id ??
      Array.from(crypto.getRandomValues(new Uint8Array(15)), (byte) =>
        (byte % 36).toString(36),
      ).join("");
    this.body = held?.body ??
      note?.body ?? { type: "doc", content: [{ type: "paragraph" }] };
    this.status = note ? "Saved" : "Idle";
    if (held) {
      this.generation = held.generation;
      this.acknowledged = held.acknowledged;
      this.submissions = held.submissions;
      this.rejection = held.rejection;
      this.failure = held.failure;
      this.error = held.error;
      this.status = "Error";
    }
  }

  get dirty() {
    return (
      !this.disposed &&
      (this.submissions.length > 0 ||
        (this.generation !== this.acknowledged &&
          (!!this.baseline || hasContent(this.body))))
    );
  }

  suspend() {
    this.dispose();
    return {
      user: this.user,
      folder: this.folder,
      id: this.id,
      body: this.body,
      baseline: this.baseline,
      generation: this.generation,
      acknowledged: this.acknowledged,
      submissions: this.submissions,
      // Recheck the outcome with fresh credentials after an authorization failure.
      rejection:
        this.rejection === "denied" ||
        (this.rejection === "bad-create" && this.failure === "locked")
          ? undefined
          : this.rejection,
      failure:
        this.failure && this.failure !== "locked"
          ? this.failure
          : ("retry" as const),
      error:
        this.failure && this.failure !== "locked"
          ? this.error
          : "Your edits are still here. Retry to save them.",
    };
  }

  get folder() {
    return this.baseline?.folder ?? this.initialFolder;
  }

  get revision() {
    return this.baseline?.revision ?? 0;
  }

  get title() {
    return this.baseline?.title ?? "";
  }

  adoptMove(state: NoteState) {
    if (
      !this.baseline ||
      !this.current ||
      state.id !== this.id ||
      state.user !== this.user ||
      (state.revision !== this.revision + 1 &&
        !(state.revision === this.revision && state.folder === this.folder)) ||
      !state.folder ||
      state.deleted
    )
      return false;
    this.baseline = {
      ...this.baseline,
      folder: state.folder,
      revision: state.revision,
    };
    this.resume();
    this.options.onChange?.();
    return true;
  }

  // Own saves and actions echo back with the revision, folder and pin this draft already holds.
  isEcho(notice: Notice, pinned?: boolean) {
    return (
      notice.revision < this.revision ||
      (notice.revision === this.revision &&
        notice.folder === this.folder &&
        !notice.deleted &&
        (notice.pinned === undefined || notice.pinned === pinned))
    );
  }

  // Applies a fresh read after a change notice; never writes.
  remote(note: SavedNote) {
    const base = this.baseline;
    if (
      !base ||
      !this.current ||
      note.id !== this.id ||
      note.user !== this.user ||
      note.deleted
    )
      return;
    if (note.revision <= base.revision) return "same";
    if (this.adoptMetadata(note)) {
      this.resume();
      this.options.onChange?.();
      return "adopted";
    }
    if (this.dirty) {
      this.changedElsewhere();
      return "conflict";
    }
    this.replaceSaved(note);
    return "replaced";
  }

  // A move elsewhere keeps the words this draft started from, so unsaved edits stay valid.
  private adoptMetadata(note: SavedNote) {
    const base = this.baseline;
    if (
      !base ||
      (note.folder === base.folder && note.revision === base.revision) ||
      !equalJSON(note.body, base.body) ||
      !equalJSON(note.attachments, base.attachments)
    )
      return false;
    this.baseline = {
      ...base,
      folder: note.folder,
      revision: note.revision,
      updated: note.updated,
    };
    return true;
  }

  async discardForAction() {
    if (this.submissions.length && !this.rejection) {
      const result = await this.reconcile();
      if (!result || !this.current) return false;
    }
    if (!this.current || !this.baseline) return false;
    this.body = this.baseline.body;
    this.editorVersion++;
    this.acknowledge(this.baseline, this.generation);
    return true;
  }

  unavailable() {
    this.fail("unavailable", "Note unavailable");
  }

  replaceSaved(note: SavedNote) {
    if (
      !this.current ||
      note.id !== this.id ||
      note.user !== this.user ||
      note.deleted
    )
      return;
    if (this.dirty) {
      this.changedElsewhere();
      return;
    }
    this.body = note.body;
    this.editorVersion++;
    this.acknowledge(note, this.generation);
    this.resume();
  }

  changedElsewhere() {
    this.resume();
    this.fail("conflict", "The saved version differs. Review the conflict.");
  }

  get busy() {
    return !!this.running;
  }

  get current() {
    return !this.disposed && this.session.current();
  }

  pause() {
    this.paused = true;
    this.clearTimer();
  }

  resume() {
    this.paused = false;
    if (this.current && this.dirty && !this.failure) this.schedule();
  }

  private schedule() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.pump();
    }, 500);
  }

  edit(body: NodeJSON) {
    if (this.disposed || !this.session.sameOwner()) return;
    this.body = body;
    this.generation++;
    if (!this.active()) return;
    this.clearTimer();
    if (!this.failure) {
      this.status = "Pending";
      if (!this.leaving && !this.paused) this.schedule();
    }
    this.options.onChange?.();
  }

  flush(): Promise<boolean> {
    if (this.failure) return this.running ?? Promise.resolve(false);
    this.clearTimer();
    this.leaving = true;
    return this.pump();
  }

  retry(): Promise<boolean> {
    if (this.running) return this.running;
    if (this.failure !== "retry" && this.failure !== "invalid")
      return Promise.resolve(false);
    this.clearTimer();
    this.leaving = true;
    return this.pump(true);
  }

  reloadSaved(): Promise<boolean> {
    if (this.running) return this.running;
    if (this.failure !== "conflict" || !this.active())
      return Promise.resolve(false);
    const generation = this.generation;
    this.running = this.reload(generation).finally(() => {
      this.leaving = false;
      this.running = undefined;
      if (this.paused && this.current) this.options.onChange?.();
    });
    return this.running;
  }

  private async reload(generation: number) {
    let note: SavedNote;
    try {
      note = await getNote(this.id, this.session);
    } catch (error) {
      if (!this.active()) return false;
      if ([401, 403, 404].includes(statusOf(error))) {
        if (!(await this.verified("conflict")) || !this.active()) return false;
      } else if (!(error instanceof NoteAccessError))
        return this.fail(
          "conflict",
          "Could not reload the saved note. Your draft is still here.",
        );
      return this.fail(
        "unavailable",
        "The saved note is unavailable. Copy your draft.",
      );
    }
    if (!this.active()) return false;
    if (generation !== this.generation)
      return this.fail(
        "conflict",
        "Your draft changed. Confirm again before replacing these edits.",
      );
    this.body = note.body;
    this.editorVersion++;
    this.acknowledge(note, generation);
    return true;
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
  }

  private active() {
    if (this.disposed) return false;
    if (this.session.current()) return true;
    this.fail("locked", "Sign in again to save this draft.");
    return false;
  }

  private clearTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private fail(kind: Failure, message: string): false {
    this.clearTimer();
    this.failure = kind;
    this.error = message;
    this.status = "Error";
    if (!this.disposed && this.session.sameEpoch()) this.options.onChange?.();
    return false;
  }

  private acknowledge(note: SavedNote, generation: number) {
    this.baseline = note;
    this.acknowledged = generation;
    this.submissions = [];
    this.rejection = undefined;
    this.failure = undefined;
    this.error = "";
    this.status = generation === this.generation ? "Saved" : "Pending";
    this.options.onSaved?.(note);
    if (this.active()) this.options.onChange?.();
  }

  private async verified(onInconclusive: "conflict" | "retry" = "retry") {
    try {
      await verifyOwner(this.user, this.session);
      return this.active();
    } catch (error) {
      if (!this.active()) return false;
      if (
        error instanceof NoteAccessError ||
        [401, 403].includes(statusOf(error))
      )
        return this.fail("locked", "Sign in again to save this draft.");
      return this.fail(
        onInconclusive,
        "Could not verify this session. Try checking the saved note again.",
      );
    }
  }

  // "replay" permits exactly one more write at the original precondition.
  private async reconcile(): Promise<
    "acknowledged" | "replay" | "adopted" | false
  > {
    if (!this.active()) return false;
    const maskedCreate = this.rejection === "bad-create";
    if (maskedCreate || this.rejection === "denied") {
      if (!(await this.verified()) || !this.active()) return false;
      if (this.rejection === "denied")
        return this.fail(
          "unavailable",
          "Saving is unavailable. Copy your draft.",
        );
    }
    let note: SavedNote;
    try {
      note = await getNote(this.id, this.session);
    } catch (error) {
      if (!this.active()) return false;
      const status = statusOf(error);
      if ([401, 403, 404].includes(status)) {
        if (
          (!maskedCreate || status !== 404) &&
          (!(await this.verified()) || !this.active())
        )
          return false;
        if (status === 404 && !this.baseline && !this.rejection)
          return "replay";
      } else if (!(error instanceof NoteAccessError))
        return this.fail(
          "retry",
          "Could not check the saved note. Retry to check again.",
        );
      return this.fail(
        "unavailable",
        "The saved note is unavailable. Copy your draft.",
      );
    }
    if (!this.active()) return false;
    const match = [...this.submissions]
      .reverse()
      .find((submission) => matchesNote(note, submission));
    if (match) {
      this.acknowledge(note, match.generation);
      return "acknowledged";
    }
    if (!this.rejection && this.baseline && matchesNote(note, this.baseline))
      return "replay";
    if (
      (!this.rejection || this.rejection === "stale") &&
      this.adoptMetadata(note)
    ) {
      // None of the submissions landed: the server still holds the baseline's words.
      this.submissions = [];
      this.rejection = undefined;
      return "adopted";
    }
    return this.fail(
      "conflict",
      "The saved version differs. Review the conflict.",
    );
  }

  private async write(): Promise<boolean> {
    const attachments = this.baseline?.attachments ?? [];
    if (!attachments.length && !hasContent(this.body)) {
      if (this.baseline || this.submissions.length)
        return this.fail(
          "invalid",
          "This note needs writing or an attachment.",
        );
      this.acknowledged = this.generation;
      this.status = "Idle";
      this.options.onChange?.();
      return true;
    }
    if (new TextEncoder().encode(JSON.stringify(this.body)).length > 102400)
      return this.fail(
        "invalid",
        "This note exceeds the 100 KB limit. Shorten it and retry.",
      );

    // After a second ambiguous write, reuse that snapshot to bound the possible winners.
    const earlier = this.submissions;
    let submission = earlier[earlier.length - 1];
    if (
      !submission ||
      (this.submissions.length === 1 &&
        submission.generation !== this.generation)
    ) {
      submission = {
        id: this.id,
        user: this.user,
        folder: this.folder,
        attachments,
        revision: this.revision + 1,
        body: structuredClone(this.body),
        generation: this.generation,
      };
      this.submissions = [...earlier, submission];
    }
    this.status =
      submission.generation === this.generation ? "Saving" : "Pending";
    this.options.onChange?.();
    if (!this.active()) return false;
    try {
      const note = await saveNote(
        this.user,
        this.folder,
        this.id,
        submission.body,
        this.revision,
        this.session,
      );
      if (!this.active()) return false;
      if (!matchesNote(note, submission)) throw new Error("Unconfirmed write");
      this.acknowledge(note, submission.generation);
      return true;
    } catch (error) {
      if (!this.active()) return false;
      const status = statusOf(error);
      const data =
        error instanceof ClientResponseError ? error.response.data : undefined;
      if (status === 400 && data?.body?.code && !data.id) {
        // A rejection of a repeat does not settle an earlier transport failure.
        this.submissions = earlier;
        return this.fail(
          "invalid",
          "Unable to save this note. Correct the document and retry.",
        );
      }
      this.rejection =
        status === 409
          ? "stale"
          : status === 400 && !this.baseline
            ? data?.id?.code === "validation_not_unique"
              ? "collision"
              : "bad-create"
            : [401, 403].includes(status)
              ? "denied"
              : undefined;
      this.fail(
        "retry",
        "Unable to save this note. Retry to check the saved version.",
      );
      if (!this.rejection && status !== 404 && status !== 400) return false;
      const result = await this.reconcile();
      if (result === "adopted" && this.active()) {
        this.failure = undefined;
        this.error = "";
        return true;
      }
      return result === "acknowledged";
    }
  }

  private pump(retry = false): Promise<boolean> {
    if (!this.running) {
      this.running = Promise.resolve().then(async () => {
        try {
          if (!this.active()) return false;
          if (retry) {
            if (this.submissions.length) {
              const result = await this.reconcile();
              if (!result || !this.active()) return false;
            }
            this.failure = undefined;
            this.error = "";
          }
          while (
            this.active() &&
            !this.failure &&
            !this.paused &&
            !this.timer &&
            this.acknowledged !== this.generation
          ) {
            if (!(await this.write())) return false;
          }
          return (
            this.active() &&
            !this.failure &&
            this.acknowledged === this.generation
          );
        } finally {
          this.leaving = false;
          this.running = undefined;
          if (this.paused && this.current) this.options.onChange?.();
        }
      });
    }
    return this.running;
  }
}
