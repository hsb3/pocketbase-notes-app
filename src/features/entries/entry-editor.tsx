import { lazy, Suspense, useContext, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useRouter } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconMaximize,
  IconMinimize,
  IconStar,
  IconDots,
  IconTrash,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";
import { ClientResponseError } from "pocketbase";
import { pb } from "@/services/pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { entriesRoute, WritingFocus } from "./workspace";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { DatePicker } from "./date-picker";
import { Skeleton } from "@/components/ui/skeleton";

import {
  bodyText,
  emptyBody,
  getEntry,
  localDate,
  validDate,
  type Entry,
} from "./data";
import type { NodeJSON } from "prosekit/core";

const Editor = lazy(
  () => import("@/components/editor/examples/toolbar/editor"),
);

type Draft = {
  title: string;
  kind: "note" | "journal";
  journal_date: string;
  body: NodeJSON;
  favorite: boolean;
};
function fromEntry(entry: Entry): Draft {
  return {
    title: entry.title,
    kind: entry.kind,
    journal_date: entry.journal_date,
    body: entry.body || emptyBody,
    favorite: entry.favorite,
  };
}
export function EntryEditor({ entry }: { entry?: Entry }) {
  const search = entriesRoute.useSearch();
  const focus = useContext(WritingFocus);
  const list = entriesRoute.useLoaderData();
  const router = useRouter();
  const [record, setRecord] = useState(entry);
  const [draft, setDraft] = useState<Draft>(() =>
    entry
      ? fromEntry(entry)
      : {
          title: "",
          kind: search.view === "journal" ? "journal" : "note",
          journal_date: search.view === "journal" ? localDate() : "",
          body: emptyBody,
          favorite: false,
        },
  );
  const baseline = useRef(JSON.stringify(draft));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [notice, setNotice] = useState("");
  const accountId = useRef(pb.authStore.record?.id);
  const accountEmail = useRef(pb.authStore.record?.email || "");
  const dirty = JSON.stringify(draft) !== baseline.current;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const bypass = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () =>
      !bypass.current && (dirtyRef.current || savingRef.current),
    enableBeforeUnload: () => dirtyRef.current || savingRef.current,
    withResolver: true,
  });
  async function save(continuing = false) {
    if (savingRef.current) return false;
    setError("");
    setNotice("");
    if (!bodyText(draft.body).trim()) {
      setError("Write something before saving.");
      return false;
    }
    if (draft.kind === "journal" && !validDate(draft.journal_date)) {
      setError("Choose a valid journal date.");
      return false;
    }
    if (!pb.authStore.isValid) {
      setReauth(true);
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const data = {
        ...draft,
        title:
          draft.title.trim() ||
          (draft.kind === "journal"
            ? `Journal — ${draft.journal_date}`
            : "Untitled note"),
        user: accountId.current,
        revision: record?.revision || 1,
      };
      const saved = record
        ? await pb.collection("entries").update<Entry>(record.id, data)
        : await pb.collection("entries").create<Entry>(data);
      const next = fromEntry(saved);
      baseline.current = JSON.stringify(next);
      dirtyRef.current = false;
      setDraft(next);
      setRecord(saved);
      setConflict(false);
      setNotice("Saved");
      if (!record && !continuing) {
        bypass.current = true;
        await router.navigate({
          to: "/entries/$entryId",
          params: { entryId: saved.id },
          search,
          replace: true,
        });
        bypass.current = false;
      }
      void router.invalidate();
      return true;
    } catch (err) {
      const code = err instanceof ClientResponseError ? err.status : 0;
      if (code === 401 || code === 403) setReauth(true);
      if (code === 400 || code === 404) {
        // Rule denials can look like missing records when a token is revoked.
        try {
          await pb.collection("users").authRefresh();
        } catch (authFailure) {
          if (
            authFailure instanceof ClientResponseError &&
            authFailure.status > 0
          )
            setReauth(true);
        }
      }
      setConflict(code === 409);
      setError(
        code === 409
          ? "A newer version was saved. This draft has not overwritten it."
          : code === 400
            ? (err as ClientResponseError).response.message ||
              "Check the entry and try again."
            : "Could not save. Your draft is still here. Try again.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  async function remove() {
    if (!record || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await pb.collection("entries").delete(record.id);
      dirtyRef.current = false;
      bypass.current = true;
      await router.navigate({ to: "/entries", search });
      void router.invalidate();
    } catch {
      setError("Could not delete this entry. Please try again.");
      setConfirmDelete(false);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function reload() {
    if (!record) return;
    try {
      const fresh = await getEntry(record.id);
      const next = fromEntry(fresh);
      baseline.current = JSON.stringify(next);
      dirtyRef.current = false;
      setRecord(fresh);
      setDraft(next);
      setEditorKey((key) => key + 1);
      setError("");
      setConflict(false);
      setConfirmReload(false);
    } catch {
      setError("Could not reload the saved version. Your draft is still here.");
      setConfirmReload(false);
    }
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setAuthError("");
    const previous = { token: pb.authStore.token, record: pb.authStore.record };
    try {
      const result = await pb
        .collection("users")
        .authWithPassword(accountEmail.current, password);
      if (result.record.id !== accountId.current) {
        pb.authStore.save(previous.token, previous.record);
        throw new Error("Use the same account to preserve this entry.");
      }
      setPassword("");
      setReauth(false);
      setError("");
      setNotice("Signed in. Save to keep your changes.");
    } catch {
      setAuthError("Could not sign in. Check your password and try again.");
    }
  }
  const notInList = record && !list.items.some((item) => item.id === record.id);
  return (
    <div className="writing-page">
      <header className="writing-header">
        <div className="flex items-center gap-1">
          {!focus?.focused && <SidebarTrigger />}
          <Button asChild size="sm" variant="ghost">
            <Link to="/entries" search={search}>
              <IconArrowLeft data-icon="inline-start" />
              <span className="back-label">Entries</span>
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              focus?.focused ? "Exit full screen" : "Enter full screen"
            }
            title={focus?.focused ? "Exit full screen" : "Enter full screen"}
            aria-pressed={focus?.focused}
            onClick={focus?.toggle}
          >
            {focus?.focused ? <IconMinimize /> : <IconMaximize />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="save-status" role="status">
            {saving
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : notice || (record ? "Saved" : "Not saved yet")}
          </span>
          <Button
            size="sm"
            onClick={() => save()}
            disabled={saving || (!dirty && !!record)}
          >
            {saving ? <IconLoader2 className="animate-spin" /> : <IconCheck />}
            Save
          </Button>
        </div>
      </header>
      <div className="writing-scroll">
        <div className="writing-document">
          {notInList && (
            <p className="muted-note">
              Not in this filtered list. Change filters to find it again.
            </p>
          )}
          <div className="document-heading">
            <label className="sr-only" htmlFor="entry-title">
              Entry title
            </label>
            <input
              id="entry-title"
              className="entry-title-input"
              placeholder={
                draft.kind === "journal"
                  ? "Give today a title…"
                  : "Untitled note"
              }
              value={draft.title}
              maxLength={160}
              disabled={saving}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  draft.favorite ? "Remove from favorites" : "Add to favorites"
                }
                aria-pressed={draft.favorite}
                disabled={saving}
                onClick={() =>
                  setDraft({ ...draft, favorite: !draft.favorite })
                }
              >
                <IconStar fill={draft.favorite ? "currentColor" : "none"} />
              </Button>
              {record && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Entry actions"
                      disabled={saving}
                    >
                      <IconDots />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => setConfirmDelete(true)}>
                        <IconTrash />
                        Delete entry
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <div className="document-meta">
            <div className="flex flex-wrap items-center gap-3">
              {record ? (
                <span className="entry-kind">
                  {draft.kind === "journal" ? "Journal" : "Note"}
                </span>
              ) : (
                <ToggleGroup
                  type="single"
                  value={draft.kind}
                  disabled={saving}
                  aria-label="Entry type"
                  onValueChange={(kind) => {
                    if (kind === "note" || kind === "journal")
                      setDraft({
                        ...draft,
                        kind,
                        journal_date: kind === "journal" ? localDate() : "",
                      });
                  }}
                >
                  <ToggleGroupItem value="note">Note</ToggleGroupItem>
                  <ToggleGroupItem value="journal">Journal</ToggleGroupItem>
                </ToggleGroup>
              )}
              {draft.kind === "journal" && (
                <DatePicker
                  value={draft.journal_date}
                  onChange={(date) =>
                    setDraft({ ...draft, journal_date: date })
                  }
                  disabled={saving}
                />
              )}
            </div>
          </div>
          {error && (
            <div className="entry-error" role="alert">
              <p>{error}</p>
              <div className="flex flex-wrap gap-2">
                {conflict ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            `${draft.title}\n\n${bodyText(draft.body)}`,
                          );
                          setNotice("Draft copied as plain text");
                        } catch {
                          setError(
                            "Clipboard unavailable. Select and copy the draft before reloading.",
                          );
                        }
                      }}
                    >
                      Copy draft
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmReload(true)}
                    >
                      Reload saved version
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => save()}
                  >
                    Retry save
                  </Button>
                )}
              </div>
            </div>
          )}
          <Suspense
            fallback={
              <Skeleton className="h-80 w-full" aria-label="Loading editor" />
            }
          >
            <Editor
              key={editorKey}
              initialBody={draft.body}
              disabled={saving}
              onChange={(body) => setDraft((current) => ({ ...current, body }))}
            />
          </Suspense>
        </div>
      </div>
      <footer className="document-footer" aria-label="Entry information">
        <span>
          {bodyText(draft.body).trim().split(/\s+/).filter(Boolean).length}{" "}
          words
        </span>
        <span>Private · Only you</span>
      </footer>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && !saving) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes before leaving?</AlertDialogTitle>
            <AlertDialogDescription>
              This entry has unsaved changes. Keep them before moving on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>
              Keep editing
            </AlertDialogCancel>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => blocker.proceed?.()}
            >
              Discard
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                if (await save(true)) blocker.proceed?.();
              }}
            >
              Save and continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{record?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the entry and any unsaved changes. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={saving} onClick={remove}>
              Delete entry
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Reloading discards unsaved changes. Copy the draft first to keep
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button onClick={reload}>Reload saved version</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={reauth} onOpenChange={setReauth}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in to save</DialogTitle>
            <DialogDescription>
              Your draft is still here. Sign back in as {accountEmail.current}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={signIn}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="reauth-password">Password</FieldLabel>
                <Input
                  id="reauth-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
              {authError && <p role="alert">{authError}</p>}
              <Button type="submit">Sign in</Button>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
