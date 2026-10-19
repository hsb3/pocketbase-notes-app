import { pb } from "@/services/pocketbase";
import type { AttachmentsResponse } from "@/services/pocketbase-types";
import type { NodeJSON } from "prosekit/core";

export type AttachmentRecord = AttachmentsResponse;
export const attachmentAccept =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,.md,.txt";
export async function uploadAttachment(file: File) {
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error("Choose a file between 1 byte and 10 MB.");
  const allowed = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
    "text/markdown",
  ];
  if (
    !allowed.includes(file.type) &&
    !(file.type === "" && /\.(md|txt)$/i.test(file.name))
  )
    throw new Error("Choose an image, PDF or text file.");
  const form = new FormData();
  form.set("user", pb.authStore.record?.id || "");
  form.set("name", file.name.slice(0, 255));
  form.set("file", file);
  return pb
    .collection("attachments")
    .create<AttachmentRecord>(form, { requestKey: null });
}
export async function attachmentBlob(id: string) {
  const record = await pb
    .collection("attachments")
    .getOne<AttachmentRecord>(id, { requestKey: null });
  const token = await pb.files.getToken({ requestKey: null });
  const response = await fetch(pb.files.getURL(record, record.file, { token }));
  if (!response.ok)
    throw new Error("File unavailable. Sign in again and retry.");
  return { record, blob: await response.blob() };
}
export async function downloadAttachment(id: string) {
  const { record, blob } = await attachmentBlob(id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = record.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function deleteUnusedAttachments(ids: string[]) {
  // Referenced files are rejected by the server; abandoned files have a cleanup job.
  await Promise.allSettled(
    ids.map((id) =>
      pb.collection("attachments").delete(id, { requestKey: null }),
    ),
  );
}
export function withoutImage(body: NodeJSON, id: string): NodeJSON {
  if (!body.content) return body;
  const content = body.content
    .filter(
      (node) =>
        !(node.type === "image" && node.attrs?.src === `attachment:${id}`),
    )
    .map((node) => withoutImage(node, id));
  return {
    ...body,
    content:
      content.length ||
      !["doc", "blockquote", "list", "tableCell", "tableHeaderCell"].includes(
        body.type || "",
      )
        ? content
        : [{ type: "paragraph" }],
  };
}

export function imageAttachmentIds(body: NodeJSON): string[] {
  const source = body.type === "image" ? body.attrs?.src : undefined;
  return [
    ...(typeof source === "string" && /^attachment:[a-z0-9]{15}$/.test(source)
      ? [source.slice(11)]
      : []),
    ...(body.content || []).flatMap(imageAttachmentIds),
  ];
}
