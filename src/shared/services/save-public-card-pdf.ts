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

/** Fetch the public-card PDF and hand it to Share / Save to Files / download. */
export async function savePublicCardPdf(input: {
  publicToken: string;
  displayName: string;
  notes?: DeliveredNote[];
}): Promise<void> {
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
  const file = new File([blob], filename, { type: "application/pdf" });

  // Prefer sharing the file (Telegram gets a PDF, not a link).
  const shareData: ShareData = { files: [file], title: input.displayName };
  if (typeof navigator !== "undefined" && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      // User cancelled — stop. Other errors fall through to download.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // iOS Safari often ignores download=; opening the blob still lets the user save the file.
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIos) window.open(url, "_blank", "noopener,noreferrer");
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
