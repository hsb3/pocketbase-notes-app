import { ClientResponseError } from "pocketbase";
import { defaultFolder, listFolders } from "@/features/folders/data";
import { pb } from "@/services/pocketbase";
import type { NotesResponse } from "@/services/pocketbase-types";
import { NoteAccessError, type ownerSession, verifyOwner } from "./data";

export type Session = ReturnType<typeof ownerSession>;
export type NoteState = Pick<
  NotesResponse,
  "id" | "user" | "folder" | "revision" | "deleted"
>;
export type NoteCommand = {
  id: string;
  user: string;
  revision: number;
  originalFolder: string;
  destination?: string;
};

function privateRead(session: Session) {
  if (!session.current()) throw new NoteAccessError("locked");
  return {
    headers: { Authorization: session.token },
    requestKey: null,
    cache: "no-store" as const,
  };
}

export function responseStatus(error: unknown) {
  return error instanceof ClientResponseError ? error.status : 0;
}

function identity(row: NoteState, cmd: NoteCommand, session: Session) {
  if (!session.current()) throw new NoteAccessError("locked");
  if (
    !row ||
    row.id !== cmd.id ||
    row.user !== cmd.user ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    typeof row.folder !== "string" ||
    typeof row.deleted !== "string"
  )
    throw Error("Unconfirmed note state.");
  if (row.deleted) {
    const iso = row.deleted.replace(" ", "T");
    const ms = Date.parse(iso);
    if (
      !Number.isFinite(ms) ||
      new Date(ms).toISOString().replace("T", " ") !== row.deleted ||
      row.deleted === "0001-01-01 00:00:00.000Z"
    )
      throw Error("Invalid deletion date.");
  } else if (!row.folder) throw Error("Missing active folder.");
  return row;
}

export function confirms(row: NoteState, cmd: NoteCommand) {
  return (
    row.revision === cmd.revision + 1 &&
    (cmd.destination
      ? row.folder === cmd.destination && row.deleted === ""
      : row.folder === cmd.originalFolder && !!row.deleted)
  );
}

export async function sendCommand(
  cmd: NoteCommand,
  session: Session,
  restore = false,
) {
  if (!session.current()) throw new NoteAccessError("locked");
  const verb = restore ? "restore" : cmd.destination ? "move" : "delete";
  const row = await pb.send<NoteState>(
    `/api/notebook/notes/${cmd.id}/${verb}`,
    {
      method: "POST",
      body: {
        revision: cmd.revision,
        folder: restore ? undefined : cmd.destination,
      },
      ...privateRead(session),
    },
  );
  identity(row, cmd, session);
  if (!confirms(row, cmd)) throw Error("Unconfirmed note action.");
  return row;
}

export async function readCommand(cmd: NoteCommand, session: Session) {
  await verifyOwner(cmd.user, session);
  try {
    const row = await pb.collection("notes").getOne<NoteState>(cmd.id, {
      fields: "id,user,folder,revision,deleted",
      ...privateRead(session),
    });
    return identity(row, cmd, session);
  } catch (error) {
    if (
      session.current() &&
      error instanceof ClientResponseError &&
      error.status === 404
    )
      return null;
    throw error;
  }
}

export type TrashRow = Pick<
  NotesResponse,
  "id" | "folder" | "title" | "revision" | "deleted"
> & { deadline: string };
type TrashPage = {
  page: number;
  totalPages: number;
  items: TrashRow[];
  serverNow: string;
};

export function readTrash(page: number, session: Session) {
  return pb.send<TrashPage>("/api/notebook/recently-deleted", {
    ...privateRead(session),
    query: { page },
  });
}

type Preview = {
  id: string;
  name: string;
  activeCount: number;
  snapshot: string;
};
export async function folderPreview(id: string, session: Session) {
  const preview = await pb.send<Preview>(
    `/api/notebook/folders/${id}/delete-preview`,
    privateRead(session),
  );
  if (
    preview.id !== id ||
    !/^[0-9a-f]{64}$/.test(preview.snapshot) ||
    !Number.isSafeInteger(preview.activeCount) ||
    preview.activeCount < 0
  )
    throw Error("Invalid folder preview.");
  return preview;
}

export function deleteFolder(preview: Preview, session: Session) {
  return pb.collection("folders").delete(preview.id, {
    ...privateRead(session),
    query: { snapshot: preview.snapshot },
  });
}

export async function checkFolder(id: string, user: string, session: Session) {
  await verifyOwner(user, session);
  let present = true;
  try {
    const row = await pb.collection("folders").getOne(id, {
      ...privateRead(session),
      fields: "id,user,is_default",
    });
    if (row.id !== id || row.user !== user || row.is_default)
      throw Error("Unexpected folder.");
  } catch (error) {
    if (responseStatus(error) !== 404) throw error;
    present = false;
  }
  if (!session.current()) throw new NoteAccessError("locked");
  const rows = await listFolders();
  defaultFolder(rows, user);
  if (!session.current() || rows.some((f) => f.id === id) !== present)
    throw Error("Folder list changed.");
  return present;
}
