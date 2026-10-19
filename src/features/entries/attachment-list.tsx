import { useEffect, useState } from "react";
import { IconFile, IconDownload, IconX } from "@tabler/icons-react";
import { pb } from "@/services/pocketbase";
import {
  Attachment,
  AttachmentContent,
  AttachmentTitle,
  AttachmentMedia,
  AttachmentActions,
  AttachmentAction,
} from "@/components/ui/attachment";
import { downloadAttachment, type AttachmentRecord } from "./attachments";

export function AttachmentList({
  ids,
  disabled,
  onRemove,
  onError,
}: {
  ids: string[];
  disabled: boolean;
  onRemove: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [files, setFiles] = useState<AttachmentRecord[]>([]);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    setLoadError("");
    Promise.all(
      ids.map((id) =>
        pb
          .collection("attachments")
          .getOne<AttachmentRecord>(id, { requestKey: null }),
      ),
    )
      .then((records) => {
        if (active) setFiles(records);
      })
      .catch(() => {
        if (active)
          setLoadError(
            "Some attachments could not load. Refresh or sign in again.",
          );
      });
    return () => {
      active = false;
    };
  }, [ids]);
  if (!ids.length) return null;
  return (
    <section aria-label="Attachments" className="mt-3 flex flex-wrap gap-2">
      {loadError && (
        <p role="alert" className="text-sm">
          {loadError}
        </p>
      )}
      {ids.map((id) => (
        <Attachment key={id} size="sm">
          <AttachmentMedia>
            <IconFile />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>
              {files.find((file) => file.id === id)?.name ||
                "Loading attachment…"}
            </AttachmentTitle>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction
              size="icon"
              aria-label={`Download ${files.find((file) => file.id === id)?.name || "attachment"}`}
              disabled={disabled}
              onClick={() =>
                downloadAttachment(id).catch((error: Error) =>
                  onError(error.message),
                )
              }
            >
              <IconDownload />
            </AttachmentAction>
            <AttachmentAction
              size="icon"
              aria-label={`Remove ${files.find((file) => file.id === id)?.name || "attachment"}`}
              disabled={disabled}
              onClick={() => onRemove(id)}
            >
              <IconX />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ))}
    </section>
  );
}
