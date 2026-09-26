/** Phase 3 ceilings. The bucket itself is capped at 50 MB. */

export const ACCOUNT_BYTE_LIMIT = 500 * 1024 * 1024;
export const IMAGE_BYTE_LIMIT = 8 * 1024 * 1024;
export const DOCUMENT_BYTE_LIMIT = 15 * 1024 * 1024;
export const AUDIO_BYTE_LIMIT = 10 * 1024 * 1024;
export const VIDEO_BYTE_LIMIT = 50 * 1024 * 1024;

/** Multipart route refuses anything larger before it looks at the bytes. */
export const BUFFERED_BODY_LIMIT = 16 * 1024 * 1024;

export const CARD_ATTACHMENTS_BUCKET = "card-attachments";
export const TRANSFER_ASSETS_BUCKET = "transfer-assets";

/** Browser recordings are webm. file-type labels that container video/webm. */
export const VOICE_NOTE_MIMES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/aac",
  "audio/webm",
  "video/webm",
] as const;

export function isTransferNoteKind(value: string): value is "selfie" | "voice" {
  return value === "selfie" || value === "voice";
}

export function transferMimeAllowed(kind: "selfie" | "voice", mime: string): boolean {
  const base = mime.split(";")[0]?.trim() ?? mime;
  if (kind === "selfie") return (IMAGE_MIMES as readonly string[]).includes(base);
  return (VOICE_NOTE_MIMES as readonly string[]).includes(base);
}

/** Owner-only redirect lifetime for `/f/{id}`. */
export const SIGNED_READ_SECONDS = 600;

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
export const AUDIO_MIMES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/ogg"] as const;
export const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export const SMALL_ATTACHMENT_KINDS = [
  "card-photo",
  "photo",
  "pdf",
  "document",
  "presentation",
  "spreadsheet",
  "audio",
] as const;

export type SmallAttachmentKind = (typeof SMALL_ATTACHMENT_KINDS)[number];

const KIND_MIMES: Record<SmallAttachmentKind, readonly string[]> = {
  "card-photo": IMAGE_MIMES,
  photo: IMAGE_MIMES,
  pdf: ["application/pdf"],
  document: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  presentation: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  spreadsheet: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  audio: AUDIO_MIMES,
};

export function isSmallAttachmentKind(value: string): value is SmallAttachmentKind {
  return (SMALL_ATTACHMENT_KINDS as readonly string[]).includes(value);
}

export function isVideoMime(mime: string): boolean {
  return (VIDEO_MIMES as readonly string[]).includes(mime);
}

export function mimeAllowedForKind(kind: SmallAttachmentKind, mime: string): boolean {
  return KIND_MIMES[kind].includes(mime);
}

export function byteLimitForMime(mime: string): number | null {
  if ((IMAGE_MIMES as readonly string[]).includes(mime)) return IMAGE_BYTE_LIMIT;
  if ((DOCUMENT_MIMES as readonly string[]).includes(mime)) return DOCUMENT_BYTE_LIMIT;
  if ((AUDIO_MIMES as readonly string[]).includes(mime)) return AUDIO_BYTE_LIMIT;
  if (isVideoMime(mime)) return VIDEO_BYTE_LIMIT;
  return null;
}

const SERVABLE_MIMES = new Set<string>([
  ...IMAGE_MIMES,
  ...DOCUMENT_MIMES,
  ...AUDIO_MIMES,
  ...VIDEO_MIMES,
]);

/** Types we will sign for a stranger. HTML and SVG are not in this set. */
export function isServableMime(mime: string): boolean {
  return SERVABLE_MIMES.has(mime);
}
