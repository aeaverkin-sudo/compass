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

const readyFiles = new Map<string, File>();
const pendingFiles = new Map<string, Promise<File>>();

export function peekPublicCardPdf(input: {
  publicToken: string;
  displayName: string;
  notes?: DeliveredNote[];
}): File | null {
  return readyFiles.get(cacheKey(input)) ?? null;
}

/** Start the PDF download. The finished file stays available after the card remounts. */
export function primePublicCardPdf(input: {
  publicToken: string;
  displayName: string;
  notes?: DeliveredNote[];
}): Promise<File> {
  const key = cacheKey(input);
  const ready = readyFiles.get(key);
  if (ready) return Promise.resolve(ready);
  const pending = pendingFiles.get(key);
  if (pending) return pending;
  const task = loadPublicCardPdfFile(input).then(
    (file) => {
      readyFiles.set(key, file);
      pendingFiles.delete(key);
      return file;
    },
    (error) => {
      pendingFiles.delete(key);
      throw error;
    },
  );
  pendingFiles.set(key, task);
  return task;
}

export async function loadPublicCardPdfFile(input: {
  publicToken: string;
  displayName: string;
  notes?: DeliveredNote[];
}): Promise<File> {
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
  return new File([blob], filename, { type: "application/pdf" });
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
export function sharePdfFile(file: File, title: string) {
  const shareData: ShareData = {
    files: [file],
    title: title.replace(/\s+/g, " ").trim() || "Portfolio",
  };
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      void navigator.share(shareData).catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        downloadPdfFile(file);
      });
      return;
    } catch {
      // share() rejected in this turn; fall through to a download.
    }
  }
  downloadPdfFile(file);
}
