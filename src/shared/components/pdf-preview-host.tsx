"use client";

import { useEffect, useRef, useState } from "react";

type PreviewFile = { blob: Blob; name: string };

const TAP_PX = 10;

/** PDF opened from the home-screen icon. The pages stay in the app, so Close returns to the card. */
export function PdfPreviewHost() {
  const pagesRef = useRef<HTMLDivElement>(null);
  const point = useRef<{ x: number; y: number } | null>(null);
  const [file, setFile] = useState<PreviewFile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<PreviewFile>).detail;
      if (!detail?.blob) return;
      setFailed(false);
      setFile(detail);
    };
    window.addEventListener("compass-pdf-preview", onPreview);
    return () => window.removeEventListener("compass-pdf-preview", onPreview);
  }, []);

  useEffect(() => {
    const host = pagesRef.current;
    if (!file || !host) return;
    const hold: { cancel: boolean } = { cancel: false };
    host.replaceChildren();

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const data = new Uint8Array(await file.blob.arrayBuffer());
        const task = pdfjs.getDocument({ data });
        try {
          const doc = await task.promise;
          if (hold.cancel) return;
          const width = host.clientWidth || window.innerWidth;
          for (let number = 1; number <= doc.numPages; number += 1) {
            if (hold.cancel) return;
            const page = await doc.getPage(number);
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: width / base.width });
            const canvas = document.createElement("canvas");
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.style.width = "100%";
            canvas.style.height = "auto";
            canvas.className = "block";
            await page.render({ canvas, viewport, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
            if (!hold.cancel) host.appendChild(canvas);
          }
        } catch {
          if (!hold.cancel) setFailed(true);
        } finally {
          await task.destroy().catch(() => undefined);
        }
      } catch {
        if (!hold.cancel) setFailed(true);
      }
    })();

    return () => {
      hold.cancel = true;
    };
  }, [file]);

  if (!file) return null;

  const close = () => setFile(null);

  const share = () => {
    const pdf = new File([file.blob], file.name, { type: "application/pdf" });
    if (typeof navigator.share !== "function") return;
    void navigator.share({ files: [pdf] }).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between gap-4 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <p className="min-w-0 truncate text-[14px] font-normal text-[#111]">{file.name}</p>
        <div className="flex shrink-0 items-center gap-5">
          {typeof navigator.share === "function" ? (
            <button type="button" onClick={share} className="text-[14px] font-normal text-[#111] underline">
              Share
            </button>
          ) : null}
          <button type="button" onClick={close} className="text-[14px] font-normal text-[#111] underline">
            Close
          </button>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onPointerDown={(event) => {
          point.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = point.current;
          point.current = null;
          if (!start) return;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_PX) return;
          close();
        }}
      >
        <div ref={pagesRef} />
        {failed ? (
          <p className="px-5 py-8 text-center text-[14px] font-normal text-[#111]">Could not open this PDF.</p>
        ) : null}
      </div>
    </div>
  );
}
