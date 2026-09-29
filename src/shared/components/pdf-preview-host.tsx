"use client";

import { useEffect, useRef, useState } from "react";

type PreviewFile = { url: string; name: string };

/** PDF opened from the home-screen icon. Close stays in the app. */
export function PdfPreviewHost() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<PreviewFile | null>(null);

  useEffect(() => {
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<PreviewFile>).detail;
      if (!detail?.url) return;
      setFile(detail);
    };
    window.addEventListener("compass-pdf-preview", onPreview);
    return () => window.removeEventListener("compass-pdf-preview", onPreview);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !file || dialog.open) return;
    dialog.showModal();
  }, [file]);

  const close = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-white p-0"
      onClose={() => {
        setFile((current) => {
          if (current) URL.revokeObjectURL(current.url);
          return null;
        });
      }}
    >
      {file ? (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
            <p className="min-w-0 truncate text-[14px] font-normal text-[#111]">{file.name}</p>
            <button type="button" onClick={close} className="shrink-0 text-[14px] font-normal text-[#111] underline">
              Close
            </button>
          </div>
          <iframe title={file.name} src={file.url} className="min-h-0 w-full flex-1 border-0" />
        </div>
      ) : null}
    </dialog>
  );
}
