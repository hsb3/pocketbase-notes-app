"use client";

import { attachmentBlob } from "@/features/notes/attachment-blob";
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

  const [aspectRatio, setAspectRatio] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();

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

  const handleImageLoad = (event: SyntheticEvent) => {
    const img = event.target as HTMLImageElement;
    const { naturalWidth, naturalHeight } = img;
    const ratio = naturalWidth / naturalHeight;
    if (ratio && Number.isFinite(ratio)) {
      setAspectRatio(ratio);
    }
  };

  return (
    <ResizableRoot
      width={attrs.width ?? undefined}
      height={attrs.height ?? undefined}
      aspectRatio={aspectRatio}
      onResizeEnd={(event) => props.setAttrs(event.detail)}
      data-selected={props.selected ? "" : undefined}
      className="group relative my-2 box-border flex max-h-150 min-h-16 max-w-full min-w-16 items-center justify-center overflow-hidden outline-2 outline-transparent outline-solid data-selected:outline-blue-500"
    >
      {url && !error && (
        <img
          src={url}
          onLoad={handleImageLoad}
          alt="Attached image"
          className="h-full max-h-full w-full max-w-full object-contain"
        />
      )}
      {error && (
        <div className="@container absolute top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center gap-4 bg-gray-200 p-2 text-sm dark:bg-gray-800">
          <div className="i-lucide-image-off block size-8"></div>
          <div className="hidden opacity-80 @xs:block">Image unavailable</div>
        </div>
      )}
      <ResizableHandle
        className="absolute right-0 bottom-0 m-1.5 rounded-sm bg-gray-900/30 p-1 text-white/50 opacity-0 transition group-hover:opacity-100 group-data-resizing:opacity-100 hover:bg-gray-800/60 hover:opacity-100 active:translate-x-0.5 active:translate-y-0.5 active:bg-gray-800/60 active:text-white/80"
        position="bottom-right"
      >
        <div className="i-lucide-arrow-down-right block size-4"></div>
      </ResizableHandle>
    </ResizableRoot>
  );
}
