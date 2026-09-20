import type { Card, ContactItem, ContactType } from "@/shared/types";

/** Attachment-like types stored as files (data URLs in `url`). */
export const ATTACHMENT_TYPES = [
  "pdf",
  "photo",
  "presentation",
  "document",
  "spreadsheet",
  "audio",
  "video",
] as const satisfies readonly ContactType[];

export type AttachmentContactType = (typeof ATTACHMENT_TYPES)[number];

export const PORTFOLIO_LIMITS = {
  /** Rows in library per card (filled + one empty draft). */
  maxItemsPerCard: 24,
  /** Items shown on the card body / QR snapshot. */
  maxItemsOnCard: 12,
  /** File attachments per card (PDF, decks, images, etc.). */
  maxAttachmentsPerCard: 8,
  /** Total stored attachment payload per card (~base64 in localStorage). */
  maxTotalAttachmentBytesPerCard: 15 * 1024 * 1024,
  /** Single-field text (description, title line). */
  maxTextLength: 2_000,
  /** URL / handle pasted as text. */
  maxUrlLength: 2_048,
  /** Card avatar — separate from portfolio attachments. */
  maxCardPhotoBytes: 512 * 1024,
  maxCardPhotoPx: 512,
  /** Per-type attachment ceilings (before base64 overhead). */
  maxBytesByType: {
    pdf: 8 * 1024 * 1024,
    photo: 4 * 1024 * 1024,
    presentation: 10 * 1024 * 1024,
    document: 5 * 1024 * 1024,
    spreadsheet: 5 * 1024 * 1024,
    audio: 8 * 1024 * 1024,
    video: 15 * 1024 * 1024,
  } as const satisfies Record<AttachmentContactType, number>,
  /** Portfolio image attachments — higher res than card avatar. */
  maxAttachmentImagePx: 2048,
  attachmentJpegQuality: 0.88,
} as const;

export type PortfolioValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function isAttachmentType(type: ContactType): type is AttachmentContactType {
  return (ATTACHMENT_TYPES as readonly ContactType[]).includes(type);
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return dataUrl.length;
  return Math.ceil((base64.length * 3) / 4);
}

export function countCardAttachments(card: Card, items: ContactItem[]): number {
  const ids = new Set(card.contactItemIds);
  return items.filter((item) => ids.has(item.id) && isAttachmentType(item.type) && item.url).length;
}

export function totalCardAttachmentBytes(card: Card, items: ContactItem[]): number {
  const ids = new Set(card.contactItemIds);
  return items
    .filter((item) => ids.has(item.id) && isAttachmentType(item.type) && item.url)
    .reduce((sum, item) => sum + estimateDataUrlBytes(item.url), 0);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function validateTextValue(value: string): PortfolioValidationResult {
  if (value.length > PORTFOLIO_LIMITS.maxTextLength) {
    return {
      ok: false,
      message: `Text is too long (max ${PORTFOLIO_LIMITS.maxTextLength.toLocaleString()} characters).`,
    };
  }
  return { ok: true };
}

export function validatePortfolioAttachment(
  file: File,
  attachmentType: AttachmentContactType,
  card: Card,
  items: ContactItem[],
  replacingItemId?: string,
): PortfolioValidationResult {
  const perTypeLimit = PORTFOLIO_LIMITS.maxBytesByType[attachmentType];
  if (file.size > perTypeLimit) {
    return {
      ok: false,
      message: `File is too large (max ${formatBytes(perTypeLimit)} for ${attachmentType}).`,
    };
  }

  const cardItems = items.filter((item) => card.contactItemIds.includes(item.id));
  const existingAttachments = cardItems.filter(
    (item) => isAttachmentType(item.type) && item.url && item.id !== replacingItemId,
  );

  if (existingAttachments.length >= PORTFOLIO_LIMITS.maxAttachmentsPerCard) {
    return {
      ok: false,
      message: `Up to ${PORTFOLIO_LIMITS.maxAttachmentsPerCard} attachments per card.`,
    };
  }

  const projectedTotal =
    totalCardAttachmentBytes(card, items) -
    (replacingItemId
      ? estimateDataUrlBytes(cardItems.find((item) => item.id === replacingItemId)?.url ?? "")
      : 0) +
    file.size;

  if (projectedTotal > PORTFOLIO_LIMITS.maxTotalAttachmentBytesPerCard) {
    return {
      ok: false,
      message: `Total attachments exceed ${formatBytes(PORTFOLIO_LIMITS.maxTotalAttachmentBytesPerCard)} per card.`,
    };
  }

  return { ok: true };
}
