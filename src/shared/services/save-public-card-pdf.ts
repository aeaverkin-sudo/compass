import type { DeliveredNote } from "@/shared/services/notes-types";

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header) ?? /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim().replace(/^"|"$/g, "") || null;
}

function cacheKey(input: { publicToken: string; displayName: string; notes?: DeliveredNote[] }) {
  const notes = (input.notes ?? [])
    .map((note) => `${note.id}:${note.type}:${note.attachmentId ?? ""}:${note.content}`)
    .join("|");
  return `${input.publicToken}\n${input.displayName}\n${notes}`;
}

type ReadyPdf = { blob: Blob; filename: string };

const readyFiles = new Map<string, ReadyPdf>();
const pendingFiles = new Map<string, Promise<ReadyPdf>>();

export function peekPublicCardPdf(input: {
  publicToken: string;
  displayName: string;
  notes?: DeliveredNote[];
}): ReadyPdf | null {
  return readyFiles.get(cacheKey(input)) ?? null;
}

/** Start the PDF download. The finished bytes stay available after the card remounts. */
export function primePublicCardPdf(input: {
  publicToken: string;
  displayName: string;
  notes?: DeliveredNote[];
}): Promise<ReadyPdf> {
  const key = cacheKey(input);
  const ready = readyFiles.get(key);
  if (ready) return Promise.resolve(ready);
  const pending = pendingFiles.get(key);
  if (pending) return pending;
  const task = loadPublicCardPdf(input).then(
    (readyPdf) => {
      readyFiles.set(key, readyPdf);
      pendingFiles.delete(key);
      return readyPdf;
    },
    (error) => {
      pendingFiles.delete(key);
      throw error;
    },
  );
  pendingFiles.set(key, task);
  return task;
}

/** iOS only accepts a File built in the same turn as the tap. */
export function fileFromReadyPdf(ready: ReadyPdf): File {
  return new File([ready.blob], ready.filename, { type: "application/pdf" });
}

export async function loadPublicCardPdf(input: {
  publicToken: string;
  displayName: string;
  notes?: DeliveredNote[];
}): Promise<ReadyPdf> {
  const response = await fetch(`/api/c/${encodeURIComponent(input.publicToken)}/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: input.notes ?? [] }),
  });
  if (!response.ok) throw new Error("Could not build the PDF");

  const blob = await response.blob();
  const filename =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ||
    `${input.displayName.replace(/\n/g, " ").trim() || "card"}.pdf`;
  return { blob, filename };
}

function downloadPdfFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Share a PDF that is already in memory.
 * iOS only opens the sheet if share() runs in the same turn as the tap,
 * so this must not wait on the network.
 */
export function sharePdfFile(file: File) {
  const shareData: ShareData = { files: [file] };
  if (typeof navigator !== "undefined" && navigator.canShare?.(shareData)) {
    void navigator.share(shareData).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      downloadPdfFile(file);
    });
    return;
  }
  downloadPdfFile(file);
}
