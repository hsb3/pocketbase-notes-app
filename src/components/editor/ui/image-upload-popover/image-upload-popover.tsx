"use client";

import type { Uploader } from "prosekit/extensions/file";
import type { ImageExtension } from "prosekit/extensions/image";
import { useEditor } from "prosekit/react";
import {
  PopoverPopup,
  PopoverPositioner,
  PopoverRoot,
  PopoverTrigger,
} from "prosekit/react/popover";
import type { OpenChangeEvent } from "prosekit/web/popover";
import { useId, useState, type ReactNode } from "react";

import { Button } from "../button/index.ts";

export default function ImageUploadPopover(props: {
  uploader: Uploader<string>;
  tooltip: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const ariaId = useId();

  const editor = useEditor<ImageExtension>();

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    const file = event.target.files?.[0];

    if (file) {
      setFile(file);
      setUrl("");
    } else {
      setFile(null);
    }
  };

  const handleUrlChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    const url = event.target.value;

    if (url) {
      setUrl(url);
      setFile(null);
    } else {
      setUrl("");
    }
  };

  const deferResetState = () => {
    setTimeout(() => {
      setUrl("");
      setFile(null);
    }, 300);
  };

  const handleSubmit = () => {
    if (url) {
      editor.commands.insertImage({ src: url });
    } else if (file) {
      editor.commands.uploadImage({ file, uploader: props.uploader });
    }
    setOpen(false);
    deferResetState();
  };

  const handleOpenChange = (event: OpenChangeEvent) => {
    if (!event.detail) {
      deferResetState();
    }
    setOpen(event.detail);
  };

  return (
    <PopoverRoot open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>
        <Button
          pressed={open}
          disabled={props.disabled}
          tooltip={props.tooltip}
        >
          {props.children}
        </Button>
      </PopoverTrigger>

      <PopoverPositioner
        placement="bottom"
        className="z-50 block h-min w-min overflow-visible transition-transform duration-100 ease-out motion-reduce:transition-none"
      >
        <PopoverPopup className="box-border flex w-sm origin-(--transform-origin) flex-col gap-y-4 rounded-xl border border-gray-200 bg-[canvas] p-6 text-sm shadow-lg transition-[opacity,scale] transition-discrete duration-40 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=closed]:duration-150 motion-reduce:transition-none dark:border-gray-800 starting:scale-95 starting:opacity-0">
          {file ? null : (
            <>
              <label htmlFor={`id-link-${ariaId}`}>Embed Link</label>
              <input
                id={`id-link-${ariaId}`}
                className="box-border flex h-9 w-full rounded-md border border-solid border-gray-200 bg-[canvas] px-3 py-2 text-sm ring-0 ring-transparent outline-hidden transition file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-0 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:placeholder:text-gray-500 dark:focus-visible:ring-gray-300"
                placeholder="Paste the image link..."
                type="url"
                value={url}
                onChange={handleUrlChange}
              />
            </>
          )}

          {url ? null : (
            <>
              <label htmlFor={`id-upload-${ariaId}`}>Upload</label>
              <input
                id={`id-upload-${ariaId}`}
                className="box-border flex h-9 w-full rounded-md border border-solid border-gray-200 bg-[canvas] px-3 py-2 text-sm ring-0 ring-transparent outline-hidden transition file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-0 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:placeholder:text-gray-500 dark:focus-visible:ring-gray-300"
                accept="image/*"
                type="file"
                onChange={handleFileChange}
              />
            </>
          )}

          {url ? (
            <button
              className="inline-flex h-10 w-full items-center justify-center rounded-md border-0 bg-gray-900 px-4 py-2 text-sm font-medium whitespace-nowrap text-gray-50 ring-offset-white transition-colors hover:bg-gray-900/90 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:ring-offset-gray-950 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
              onClick={handleSubmit}
            >
              Insert Image
            </button>
          ) : null}

          {file ? (
            <button
              className="inline-flex h-10 w-full items-center justify-center rounded-md border-0 bg-gray-900 px-4 py-2 text-sm font-medium whitespace-nowrap text-gray-50 ring-offset-white transition-colors hover:bg-gray-900/90 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:ring-offset-gray-950 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
              onClick={handleSubmit}
            >
              Upload Image
            </button>
          ) : null}
        </PopoverPopup>
      </PopoverPositioner>
    </PopoverRoot>
  );
}
