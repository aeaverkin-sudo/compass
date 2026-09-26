import type { Card, ContactItem } from "@/shared/types";

/** A stored avatar: the local preview, or the ready file on the server. */
export function cardHasPhoto(card: Pick<Card, "photo" | "photoAttachmentId">): boolean {
  return Boolean(card.photo || card.photoAttachmentId);
}

/**
 * What to put in `<img src>`. A fresh pick is still a data URL.
 * Once that preview is cleared, the ready file is `/f/{id}`.
 */
export function cardPhotoSrc(card: Pick<Card, "photo" | "photoAttachmentId">): string | null {
  if (card.photo?.startsWith("data:") || card.photo?.startsWith("blob:")) return card.photo;
  if (card.photoAttachmentId) return `/f/${card.photoAttachmentId}`;
  return card.photo || null;
}

/** Library thumbnail for a photo item. Other files stay as a name. */
export function itemPhotoSrc(item: Pick<ContactItem, "type" | "url" | "attachmentId">): string | null {
  if (item.type !== "photo") return null;
  if (item.url.startsWith("data:") || item.url.startsWith("blob:")) return item.url;
  if (item.attachmentId) return `/f/${item.attachmentId}`;
  return null;
}
