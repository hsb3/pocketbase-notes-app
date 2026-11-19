import { pb } from "@/services/pocketbase";
import type { FoldersResponse } from "@/services/pocketbase-types";

type Folder = Pick<FoldersResponse, "id" | "user" | "name" | "is_default">;
const fields = "id,user,name,is_default";

export function listFolders() {
  return pb.collection("folders").getFullList<Folder>({
    fields,
    sort: "-is_default,name_key,id",
    requestKey: null,
  });
}

export function createFolder(name: string) {
  const user = pb.authStore.record?.id;
  if (!user) throw new Error("Sign in to create a folder.");
  return pb
    .collection("folders")
    .create<Folder>({ user, name }, { fields, requestKey: null });
}

export function defaultFolder(folders: readonly Folder[], user: string) {
  const defaults = folders.filter(
    (folder) => folder.user === user && folder.is_default,
  );
  if (defaults.length !== 1)
    throw new Error("Expected exactly one Notes folder.");
  return defaults[0];
}
