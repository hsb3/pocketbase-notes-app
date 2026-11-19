import { ClientResponseError } from "pocketbase";
import { pb } from "@/services/pocketbase";
import type { NotesResponse } from "@/services/pocketbase-types";
import { NoteAccessError, type ownerSession, verifyOwner } from "./data";

type Session = ReturnType<typeof ownerSession>;
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

export async function sendCommand(cmd: NoteCommand, session: Session) {
  if (!session.current()) throw new NoteAccessError("locked");
  const verb = cmd.destination ? "move" : "delete";
  const row = await pb.send<NoteState>(
    `/api/notebook/notes/${cmd.id}/${verb}`,
    {
      method: "POST",
      body: { revision: cmd.revision, folder: cmd.destination },
      headers: { Authorization: session.token },
      requestKey: null,
      cache: "no-store",
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
      headers: { Authorization: session.token },
      requestKey: null,
      cache: "no-store",
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
