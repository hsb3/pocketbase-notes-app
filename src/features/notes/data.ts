import { pb } from "@/services/pocketbase";
import type { NotesResponse } from "@/services/pocketbase-types";
import type { NodeJSON } from "prosekit/core";

type Note = NotesResponse<NodeJSON>;
type Detail = Pick<
  Note,
  | "id"
  | "user"
  | "folder"
  | "title"
  | "attachments"
  | "revision"
  | "updated"
  | "deleted"
> & { body: NodeJSON };
// shortcut: excerpt is response-only. Recheck this local projection after wave 5 codegen.
type Summary = Pick<Note, "id" | "folder" | "title" | "updated"> & {
  excerpt: string;
};
const detailFields =
  "id,user,folder,title,body,attachments,revision,updated,deleted";

const active = 'deleted = ""';

export function listNotes(folder: string, page: number) {
  return pb.collection("notes").getList<Summary>(page, 20, {
    fields: "id,folder,title,updated,excerpt",
    filter:
      folder === "all"
        ? active
        : active + " && " + pb.filter("folder = {:folder}", { folder }),
    sort: "-updated,-id",
    requestKey: null,
  });
}

export function searchTerm(value: unknown) {
  if (
    typeof value !== "string" &&
    typeof value !== "boolean" &&
    !Number.isFinite(value)
  )
    return "";
  const term = String(value).trim();
  if (/[\p{Cc}\u2028\u2029]/u.test(term)) return "";
  return Array.from(term).slice(0, 160).join("").trimEnd();
}

type SearchHit = Omit<Summary, "excerpt"> & {
  snippet: { before: string; match: string; after: string };
};

export function searchNotes(term: string, page: number) {
  const folded = term.normalize("NFC").toUpperCase().normalize("NFC");
  const pattern = "%" + folded.replace(/[\\%_]/g, "\\$&") + "%";
  return pb.collection("notes").getList<SearchHit>(page, 20, {
    query: { searchTerm: term },
    filter: active + " && " + pb.filter("search_key ~ {:pattern}", { pattern }),
    fields: "id,folder,title,updated,snippet",
    sort: "-updated,-id",
    requestKey: null,
    cache: "no-store",
  });
}

export class NoteAccessError extends Error {
  constructor(readonly reason: "locked" | "unavailable") {
    super(
      reason === "locked"
        ? "Sign in again to save this draft."
        : "Note unavailable.",
    );
  }
}

let sessionEpoch = 0;
pb.authStore.onChange(() => {
  sessionEpoch++;
});

export function ownerSession(user: string) {
  const epoch = sessionEpoch;
  const token = pb.authStore.token;
  const sameOwner = () =>
    !!user &&
    pb.authStore.record?.collectionName === "users" &&
    pb.authStore.record.id === user;
  return {
    token,
    sameOwner,
    sameEpoch: () => epoch === sessionEpoch,
    current: () =>
      epoch === sessionEpoch && pb.authStore.isValid && sameOwner(),
  };
}

type Session = ReturnType<typeof ownerSession>;
function checkSession(session: Session) {
  if (!session.current()) throw new NoteAccessError("locked");
}

export async function verifyOwner(user: string, session: Session) {
  checkSession(session);
  // The SDK's authRefresh installs its result even if a different owner has since signed in.
  const { record } = await pb.send<{
    record: { id: string; collectionName: string };
  }>("/api/collections/users/auth-refresh", {
    method: "POST",
    headers: { Authorization: session.token },
    requestKey: null,
    cache: "no-store",
  });
  checkSession(session);
  if (record?.id !== user || record.collectionName !== "users")
    throw new NoteAccessError("locked");
}

export async function getNote(
  id: string,
  session = ownerSession(pb.authStore.record?.id ?? ""),
) {
  checkSession(session);
  const user = pb.authStore.record?.id;
  const note = await pb.collection("notes").getOne<Detail>(id, {
    fields: detailFields,
    requestKey: null,
    cache: "no-store",
  });
  checkSession(session);
  if (
    note.id !== id ||
    note.user !== user ||
    note.deleted !== "" ||
    !note.folder ||
    !note.body ||
    !Array.isArray(note.attachments) ||
    !Number.isSafeInteger(note.revision) ||
    note.revision < 1
  )
    throw new NoteAccessError("unavailable");
  return note;
}

function equalJSON(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equalJSON(v, b[i]))
    );
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(
      ([key, value]) =>
        Object.prototype.propertyIsEnumerable.call(b, key) &&
        equalJSON(value, (b as Record<string, unknown>)[key]),
    )
  );
}

export function matchesNote(
  note: Detail,
  expected: Pick<
    Detail,
    "id" | "user" | "folder" | "revision" | "attachments" | "body"
  >,
) {
  return (
    note.deleted === "" &&
    note.id === expected.id &&
    note.user === expected.user &&
    note.folder === expected.folder &&
    note.revision === expected.revision &&
    equalJSON(note.attachments, expected.attachments) &&
    equalJSON(note.body, expected.body)
  );
}

export async function saveNote(
  user: string,
  folder: string,
  id: string,
  body: NodeJSON,
  revision: number,
  session = ownerSession(user),
) {
  checkSession(session);
  const options = { fields: detailFields, requestKey: null };
  const notes = pb.collection("notes");
  const note =
    revision === 0
      ? await notes.create<Detail>(
          { id, user, folder, body, attachments: [] },
          options,
        )
      : await notes.update<Detail>(id, { revision, body }, options);
  checkSession(session);
  if (
    note.user !== user ||
    note.id !== id ||
    note.folder !== folder ||
    note.revision !== revision + 1
  )
    throw new Error("The note save could not be confirmed.");
  return note;
}
