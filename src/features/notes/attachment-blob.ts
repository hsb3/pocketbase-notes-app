import { pb } from "@/services/pocketbase";

export async function attachmentBlob(id: string) {
  const [record, token] = await Promise.all([
    pb.collection("attachments").getOne(id, { requestKey: null }),
    pb.files.getToken({ requestKey: null }),
  ]);
  const response = await fetch(pb.files.getURL(record, record.file, { token }));
  if (!response.ok)
    throw new Error("File unavailable. Sign in again and retry.");
  return { record, blob: await response.blob() };
}
