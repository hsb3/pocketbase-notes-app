import { pb } from "@/services/pocketbase";
import type { NodeJSON } from "prosekit/core";
import { getEntry, type Entry } from "@/features/entries/data";

export type TaskEntry = Pick<
  Entry,
  | "id"
  | "title"
  | "kind"
  | "journal_date"
  | "created"
  | "revision"
  | "open_tasks"
  | "tasks"
>;

// Reads only the server-derived index, never entry bodies.
export function listOpenTasks() {
  return pb.collection("entries").getFullList<TaskEntry>({
    filter: "open_tasks > 0",
    sort: "-created,-id",
    fields: "id,title,kind,journal_date,created,revision,open_tasks,tasks",
    batch: 200,
    requestKey: null,
  });
}

export class TaskConflict extends Error {}

// Saves through the same revision check as the editor: a stale revision is a 409, never an overwrite.
export async function completeTask(entry: TaskEntry, path: number[]) {
  const fresh = await getEntry(entry.id);
  if (fresh.revision !== entry.revision || !fresh.body)
    throw new TaskConflict();
  const body = structuredClone(fresh.body);
  const node = path.reduce<NodeJSON | undefined>(
    (node, index) => node?.content?.[index],
    body,
  );
  if (
    node?.type !== "list" ||
    node.attrs?.kind !== "task" ||
    node.attrs.checked
  )
    throw new TaskConflict();
  node.attrs = { ...node.attrs, checked: true };
  try {
    return await pb
      .collection("entries")
      .update<Entry>(entry.id, { body, revision: entry.revision });
  } catch (error) {
    if ((error as { status?: number }).status === 409) throw new TaskConflict();
    throw error;
  }
}
