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

export function listNotes(folder: string, page: number) {
  const active = 'deleted = ""';
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

export async function getNote(id: string) {
  const user = pb.authStore.record?.id;
  const note = await pb
    .collection("notes")
    .getOne<Detail>(id, { fields: detailFields, requestKey: null });
  if (
    !user ||
    note.user !== user ||
    pb.authStore.record?.id !== user ||
    note.deleted ||
    !note.body
  )
    throw new Error("Note unavailable.");
  return note;
}

export async function saveNote(
  user: string,
  folder: string,
  id: string,
  body: NodeJSON,
  revision: number,
) {
  if (pb.authStore.record?.id !== user)
    throw new Error("Sign in as the owner to save this note.");
  const options = { fields: detailFields, requestKey: null };
  const notes = pb.collection("notes");
  const note =
    revision === 0
      ? await notes.create<Detail>(
          { id, user, folder, body, attachments: [] },
          options,
        )
      : await notes.update<Detail>(id, { revision, body }, options);
  if (
    pb.authStore.record?.id !== user ||
    note.user !== user ||
    note.id !== id ||
    note.folder !== folder ||
    note.revision !== revision + 1
  ) {
    throw new Error("The note save could not be confirmed.");
  }
  return note;
}
