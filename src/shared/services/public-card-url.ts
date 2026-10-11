/** Pretty `/@handle` when the card has one. The token URL stays as the fallback. */
export function publicCardPath(card: { publicToken: string; handle?: string }): string {
  const handle = card.handle?.trim().toLowerCase();
  if (handle) return `/@${handle}`;
  return `/c/${card.publicToken}`;
}

/** Seconds since epoch from `updatedAt`. Messengers cache by full URL; a new v busts the preview. */
export function publicCardPreviewVersion(card: { updatedAt?: string; photoAttachmentId?: string; photo?: string; displayName?: string }): number {
  if (card.updatedAt) {
    const seconds = Math.floor(new Date(card.updatedAt).getTime() / 1000);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  const raw = `${card.photoAttachmentId ?? ""}\n${card.photo ?? ""}\n${card.displayName ?? ""}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  return hash;
}

export function publicCardUrl(card: { publicToken: string; handle?: string }): string {
  const path = publicCardPath(card);
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/** Share → Link only. QR, PDF, and /save stay on `publicCardUrl` with a stable address. */
export function publicCardShareUrl(
  card: { publicToken: string; handle?: string; updatedAt?: string; photoAttachmentId?: string; photo?: string; displayName?: string },
): string {
  const base = publicCardUrl(card);
  const v = publicCardPreviewVersion(card);
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}v=${v}`;
}
