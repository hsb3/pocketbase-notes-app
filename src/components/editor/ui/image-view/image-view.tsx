"use client";

import { attachmentBlob } from "@/features/entries/attachments";
import { UploadTask } from "prosekit/extensions/file";
import type { ImageAttrs } from "prosekit/extensions/image";
import type { ReactNodeViewProps } from "prosekit/react";
import { ResizableHandle, ResizableRoot } from "prosekit/react/resizable";
import { useEffect, useState, type SyntheticEvent } from "react";

export default function ImageView(props: ReactNodeViewProps) {
  const attrs = props.node.attrs as ImageAttrs;
  const source = attrs.src || "";
  const [resolvedURL, setResolvedURL] = useState("");
  const privateImage = source.startsWith("attachment:");
  const url = privateImage ? resolvedURL : source;
  const uploading = !privateImage && source.startsWith("blob:");

  const [aspectRatio, setAspectRatio] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setError(undefined);
    setResolvedURL("");
    if (!privateImage) return;
    let active = true;
    let objectURL = "";
    attachmentBlob(source.slice(11))
      .then(({ blob }) => {
        if (!active) return;
        objectURL = URL.createObjectURL(blob);
        setResolvedURL(objectURL);
      })
      .catch(() => {
        if (active) setError("Unable to load private image");
      });
    return () => {
      active = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [source, privateImage]);

  useEffect(() => {
    if (!uploading) return;

    const uploadTask = UploadTask.get<string>(url);
    if (!uploadTask) return;

    let canceled = false;

    uploadTask.finished.catch((error) => {
      if (canceled) return;
      setError(String(error));
    });
    const unsubscribeProgress = uploadTask.subscribeProgress(
      ({ loaded, total }) => {
        if (canceled) return;
        setProgress(total ? loaded / total : 0);
      },
    );

    return () => {
      canceled = true;
      unsubscribeProgress();
    };
  }, [url, uploading]);

  const handleImageLoad = (event: SyntheticEvent) => {
    const img = event.target as HTMLImageElement;
    const { naturalWidth, naturalHeight } = img;
    const ratio = naturalWidth / naturalHeight;
    if (ratio && Number.isFinite(ratio)) {
      setAspectRatio(ratio);
    }
    if (naturalWidth && naturalHeight && (!attrs.width || !attrs.height)) {
      props.setAttrs({ width: naturalWidth, height: naturalHeight });
    }
  };

  return (
    <ResizableRoot
      width={attrs.width ?? undefined}
      height={attrs.height ?? undefined}
      aspectRatio={aspectRatio}
      onResizeEnd={(event) => props.setAttrs(event.detail)}
      data-selected={props.selected ? "" : undefined}
      className="group relative my-2 box-border flex max-h-150 min-h-16 min-w-16 max-w-full items-center justify-center overflow-hidden outline-2 outline-solid outline-transparent data-selected:outline-blue-500"
    >
      {url && !error && (
        <img
          src={url}
          onLoad={handleImageLoad}
          alt="Attached image"
          className="h-full max-h-full w-full max-w-full object-contain"
        />
      )}
      {uploading && !error && (
        <div className="absolute bottom-0 left-0 m-1 flex content-center items-center gap-2 rounded-sm bg-gray-800/60 p-1.5 text-white/80 text-xs transition">
          <div className="i-lucide-loader-circle block size-4 animate-spin"></div>
          <div>{Math.round(progress * 100)}%</div>
        </div>
      )}
      {error && (
        <div className="@container absolute top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center gap-4 bg-gray-200 p-2 text-sm dark:bg-gray-800">
          <div className="i-lucide-image-off block size-8"></div>
          <div className="@xs:block hidden opacity-80">Image unavailable</div>
        </div>
      )}
      <ResizableHandle
        className="absolute right-0 bottom-0 m-1.5 rounded-sm bg-gray-900/30 p-1 text-white/50 opacity-0 transition hover:bg-gray-800/60 hover:opacity-100 active:translate-x-0.5 active:translate-y-0.5 active:bg-gray-800/60 active:text-white/80 group-hover:opacity-100 group-data-resizing:opacity-100"
        position="bottom-right"
      >
        <div className="i-lucide-arrow-down-right block size-4"></div>
      </ResizableHandle>
    </ResizableRoot>
  );
}
