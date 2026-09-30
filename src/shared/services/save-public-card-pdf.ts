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
  resolve?: (ready: ReadyPdf) => void;
  reject?: (error: unknown) => void;
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

function inputKey(input: CardPdfInput) {
  const notes = (input.notes ?? [])
    .map((note) => `${note.id}:${note.type}:${note.attachmentId ?? ""}:${note.content}`)
    .join("|");
  return `${input.publicToken}\n${input.displayName}\n${input.revision ?? ""}\n${notes}`;
}

function cacheKey(input: CardPdfInput) {
  return inputKey(input);
}

/** The hidden card sheets call this, then publish when the file is painted. */
export function beginCardPdf(input: CardPdfInput): Promise<ReadyPdf> {
  const key = cacheKey(input);
  const entry = entryFor(input.cardId);
  if (entry.key === key && entry.ready) return Promise.resolve(entry.ready);
  if (entry.key === key && entry.pending) return entry.pending;
  let resolve: (ready: ReadyPdf) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const pending = new Promise<ReadyPdf>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  entries.set(input.cardId, { generation: entry.generation, key, pending, resolve, reject });
  return pending;
}

export function publishCardPdf(input: CardPdfInput, ready: ReadyPdf) {
  const key = cacheKey(input);
  const entry = entries.get(input.cardId);
  if (!entry || entry.key !== key) return;
  entry.resolve?.(ready);
  entries.set(input.cardId, { generation: entry.generation, key, ready });
}

export function failCardPdf(input: CardPdfInput, error: unknown) {
  const key = cacheKey(input);
  const entry = entries.get(input.cardId);
  if (!entry || entry.key !== key) return;
  console.error("[pdf] paint failed", error);
  entry.reject?.(error);
  entries.set(input.cardId, { generation: entry.generation });
}

function peekPublicCardPdf(input: CardPdfInput): ReadyPdf | null {
  const entry = entries.get(input.cardId);
  return entry?.key === inputKey(input) ? (entry.ready ?? null) : null;
}

/** The file is painted from the card already on screen. This waits for that paint. */
export function primePublicCardPdf(input: CardPdfInput): Promise<ReadyPdf> {
  return beginCardPdf(input);
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

export type CardShareChoice = "link" | "pdf";

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
  if (choice === "link") {
    return { method: "share", data: { title: link.title, url: link.url }, includesFile: false };
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
    () => true,
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
 * Link sends the URL. PDF sends the file.
 * Resolves true when the link or the file was handed off. Cancel resolves false.
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
    () => true,
    (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      if (resolved.includesFile && file) {
        handFile(file);
        return !isHomeScreenApp();
      }
      return copyLink(url);
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
