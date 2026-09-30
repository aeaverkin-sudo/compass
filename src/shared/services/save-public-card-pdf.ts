import type { DeliveredNote } from "@/shared/services/notes-types";
import { subscribeLiveQrPulse } from "@/shared/lib/live-qr-pulse";

export type CardPdfInput = {
  cardId: string;
  publicToken: string;
  displayName: string;
  notes?: DeliveredNote[];
  /** Cache key only. Owner notes are read on the server, not from this field. */
  revision?: string;
};

type ReadyPdf = { blob: Blob; filename: string };

type CardPdfEntry = {
  /** Bumped on every server-side change to the card. Older builds are discarded. */
  generation: number;
  key?: string;
  ready?: ReadyPdf;
  pending?: Promise<ReadyPdf>;
};

const entries = new Map<string, CardPdfEntry>();
const staleListeners = new Set<(cardId: string) => void>();

function entryFor(cardId: string): CardPdfEntry {
  let entry = entries.get(cardId);
  if (!entry) {
    entry = { generation: 0 };
    entries.set(cardId, entry);
  }
  return entry;
}

if (typeof window !== "undefined") {
  subscribeLiveQrPulse((cardId) => {
    const entry = entryFor(cardId);
    entries.set(cardId, { generation: entry.generation + 1 });
    staleListeners.forEach((listener) => listener(cardId));
  });
}

/** Fires after the card's saved content changed and its PDF must be rebuilt. */
export function subscribeCardPdfStale(listener: (cardId: string) => void) {
  staleListeners.add(listener);
  return () => {
    staleListeners.delete(listener);
  };
}

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

function inputKey(input: CardPdfInput) {
  const notes = (input.notes ?? [])
    .map((note) => `${note.id}:${note.type}:${note.attachmentId ?? ""}:${note.content}`)
    .join("|");
  return `${input.publicToken}\n${input.revision ?? ""}\n${notes}`;
}

async function loadPublicCardPdf(input: CardPdfInput): Promise<ReadyPdf> {
  const response = await fetch(`/api/c/${encodeURIComponent(input.publicToken)}/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: input.notes ?? [] }),
  });
  if (!response.ok) throw new Error(`Could not build the PDF (${response.status})`);

  const blob = await response.blob();
  const filename =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ||
    `${input.displayName.replace(/\n/g, " ").trim() || "portfolio"}.pdf`;
  return { blob, filename };
}

function peekPublicCardPdf(input: CardPdfInput): ReadyPdf | null {
  const entry = entries.get(input.cardId);
  return entry?.key === inputKey(input) ? (entry.ready ?? null) : null;
}

/** Build the PDF ahead of the tap so the share sheet can open instantly. */
export function primePublicCardPdf(input: CardPdfInput): Promise<ReadyPdf> {
  const key = inputKey(input);
  const entry = entryFor(input.cardId);
  if (entry.key === key && entry.ready) return Promise.resolve(entry.ready);
  if (entry.key === key && entry.pending) return entry.pending;

  const generation = entry.generation;
  const task = loadPublicCardPdf(input).then((ready) => {
    const current = entries.get(input.cardId);
    if (current?.generation === generation && current.key === key) {
      entries.set(input.cardId, { generation, key, ready });
    }
    return ready;
  });
  entries.set(input.cardId, { generation, key, pending: task });
  task.catch(() => {
    const current = entries.get(input.cardId);
    if (current?.pending === task) entries.set(input.cardId, { generation });
  });
  return task;
}

function toFile(ready: ReadyPdf): File {
  return new File([ready.blob], ready.filename, { type: "application/pdf" });
}

/** Home-screen icon. A PDF opened in that window has no browser Back or Close. */
export function isHomeScreenApp() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

/** Last resort when the share sheet is unavailable: the PDF opens in the browser's own viewer. */
function openPdf(file: File) {
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
 * Stay inside the home-screen app.
 * A blob or iframe PDF replaces that window on iPhone, and then there is no Close.
 */
function previewPdf(file: File) {
  window.dispatchEvent(
    new CustomEvent("compass-pdf-preview", { detail: { blob: file, name: file.name } }),
  );
}

export type CardShareChoice = "link" | "pdf" | "both";

export type ResolvedCardShare =
  | { method: "share"; data: ShareData; includesFile: boolean }
  | { method: "file"; file: File }
  | { method: "wait" };

/** What the tap can hand to the system sheet without waiting. */
export function resolveCardShare(
  choice: CardShareChoice,
  link: { title: string; url: string },
  file: File | null,
  canShare: (data: ShareData) => boolean,
): ResolvedCardShare {
  const linkData: ShareData = { title: link.title, url: link.url };
  if (choice === "link") return { method: "share", data: linkData, includesFile: false };
  if (choice === "both") {
    if (file) {
      const both: ShareData = { title: link.title, url: link.url, files: [file] };
      if (canShare(both)) return { method: "share", data: both, includesFile: true };
    }
    return { method: "share", data: linkData, includesFile: false };
  }
  if (!file) return { method: "wait" };
  const pdf: ShareData = { files: [file] };
  if (canShare(pdf)) return { method: "share", data: pdf, includesFile: true };
  return { method: "file", file };
}

function canSend(data: ShareData): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return !data.files?.length;
  try {
    return navigator.canShare(data);
  } catch {
    return false;
  }
}

function handFile(file: File) {
  if (isHomeScreenApp()) previewPdf(file);
  else openPdf(file);
}

function copyLink(url: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return Promise.resolve(false);
  return navigator.clipboard.writeText(url).then(
    () => false,
    () => false,
  );
}

/** True when the file was handed off. False when the share sheet is cancelled. */
function sharePdfFile(file: File): Promise<boolean> {
  const shareData: ShareData = { files: [file] };
  if (!canSend(shareData)) {
    handFile(file);
    return Promise.resolve(!isHomeScreenApp());
  }
  return navigator.share(shareData).then(
    () => true,
    (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      handFile(file);
      return !isHomeScreenApp();
    },
  );
}

/**
 * Owner share. Call from the menu item's click so `navigator.share` stays in that tap.
 * Link is the default. Link + PDF falls back to the link when a file cannot ride along.
 * Resolves true only when a PDF file was handed off.
 */
export function shareCardChoice(
  input: CardPdfInput,
  choice: CardShareChoice,
  link: { title: string; url: string },
): Promise<boolean> {
  const title = link.title.trim() || "Portfolio";
  const url = link.url;
  const ready = peekPublicCardPdf(input);
  const file = ready ? toFile(ready) : null;
  const resolved = resolveCardShare(choice, { title, url }, file, canSend);

  if (resolved.method === "wait") {
    return primePublicCardPdf(input)
      .then((built) => sharePdfFile(toFile(built)))
      .catch((error) => {
        console.error("[pdf] share failed", error);
        return false;
      });
  }

  if (resolved.method === "file") {
    handFile(resolved.file);
    return Promise.resolve(!isHomeScreenApp());
  }

  if (!canSend(resolved.data)) {
    if (resolved.includesFile && file) {
      handFile(file);
      return Promise.resolve(!isHomeScreenApp());
    }
    return copyLink(url);
  }

  return navigator.share(resolved.data).then(
    () => resolved.includesFile,
    (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      if (resolved.includesFile && file) {
        handFile(file);
        return !isHomeScreenApp();
      }
      return copyLink(url).then(() => false);
    },
  );
}

/**
 * Share the card as a PDF file — never as a link.
 * iOS opens the sheet only when share() runs in the tap itself, so the file is
 * normally prebuilt. If it is still building, the file is shared the moment it lands.
 */
export function shareCardPdf(input: CardPdfInput): Promise<boolean> {
  const ready = peekPublicCardPdf(input);
  if (ready) return sharePdfFile(toFile(ready));
  return primePublicCardPdf(input)
    .then((built) => sharePdfFile(toFile(built)))
    .catch((error) => {
      console.error("[pdf] share failed", error);
      return false;
    });
}
