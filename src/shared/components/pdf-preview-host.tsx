"use client";

import { useEffect, useRef, useState } from "react";
import { isHomeScreenApp } from "@/shared/services/save-public-card-pdf";

type PreviewFile = { id?: number; blob: Blob | null; name: string };

let ticket = 0;

/** Open a stored PDF inside the home-screen app. Returns false when the link should open normally. */
export function openHomeScreenAttachmentPdf(url: string, name: string) {
  if (typeof window === "undefined" || !isHomeScreenApp()) return false;
  const id = ++ticket;
  const label = name.trim() || "PDF";
  window.dispatchEvent(new CustomEvent("compass-pdf-preview", { detail: { id, name: label, blob: null } }));
  void fetch(url)
    .then(async (response) => {
      if (id !== ticket) return;
      if (!response.ok) throw new Error("pdf");
      const blob = await response.blob();
      const type = (response.headers.get("content-type") ?? blob.type).split(";")[0]?.trim().toLowerCase();
      if (type !== "application/pdf") throw new Error("pdf");
      if (id !== ticket) return;
      const filename = /\.pdf$/i.test(label) ? label : `${label}.pdf`;
      window.dispatchEvent(
        new CustomEvent("compass-pdf-preview", { detail: { id, name: filename, blob } }),
      );
    })
    .catch(() => {
      if (id !== ticket) return;
      window.dispatchEvent(
        new CustomEvent("compass-pdf-preview", { detail: { id, name: label, blob: null, failed: true } }),
      );
    });
  return true;
}

const TAP_PX = 10;

/** PDF opened from the home-screen icon. The pages stay in the app, so Close returns to the card. */
export function PdfPreviewHost() {
  const pagesRef = useRef<HTMLDivElement>(null);
  const point = useRef<{ x: number; y: number } | null>(null);
  const [file, setFile] = useState<PreviewFile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<PreviewFile & { failed?: boolean }>).detail;
      if (!detail?.name) return;
      if (detail.failed) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setFile(detail);
    };
    window.addEventListener("compass-pdf-preview", onPreview);
    return () => window.removeEventListener("compass-pdf-preview", onPreview);
  }, []);

  useEffect(() => {
    const host = pagesRef.current;
    const blob = file?.blob;
    if (!blob || !host) return;
    const hold: { cancel: boolean } = { cancel: false };
    host.replaceChildren();

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const data = new Uint8Array(await blob.arrayBuffer());
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

  const close = () => {
    ticket += 1;
    setFile(null);
    setFailed(false);
  };

  const share = () => {
    if (!file.blob) return;
    const pdf = new File([file.blob], file.name, { type: "application/pdf" });
    if (typeof navigator.share !== "function") return;
    void navigator.share({ files: [pdf] }).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between gap-4 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <p className="min-w-0 truncate t-meta text-[var(--ink)]">{file.name}</p>
        <div className="flex shrink-0 items-center gap-5">
          {file.blob && typeof navigator.share === "function" ? (
            <button type="button" onClick={share} className="t-meta text-[var(--ink)] underline">
              Share
            </button>
          ) : null}
          <button type="button" onClick={close} className="t-meta text-[var(--ink)] underline">
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
        {!file.blob && !failed ? (
          <p className="px-5 py-8 text-center t-meta text-[var(--ink)]">Opening…</p>
        ) : null}
        {failed ? (
          <p className="px-5 py-8 text-center t-meta text-[var(--ink)]">Could not open this PDF.</p>
        ) : null}
      </div>
    </div>
  );
}
