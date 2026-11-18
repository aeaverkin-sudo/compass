import { isNoteCode, splitCodedHandle } from "@/shared/services/card-handle";

/** A new address is `/{code}/@{slug}`. One already given out stays `/@handle`. No handle stays the token. */
export function publicCardPath(card: { publicToken: string; handle?: string }): string {
  const handle = card.handle?.trim().toLowerCase();
  if (handle) {
    const coded = splitCodedHandle(handle);
    if (coded) return `/${coded.code}/@${coded.slug}`;
    return `/@${handle}`;
  }
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

/** The address with one note in front of the nick. No nick: the path is unchanged. */
export function publicCardPathWithNote(card: { publicToken: string; handle?: string }, note: string): string {
  const path = publicCardPath(card);
  const code = note.trim().toLowerCase();
  if (!isNoteCode(code)) return path;
  const at = path.indexOf("/@");
  if (at === -1) return path;
  return at === 0 ? `/-${code}${path}` : `${path.slice(0, at)}-${code}${path.slice(at)}`;
}

/**
 * The share link that carries one note. The nick stays last.
 * A card with no nick keeps the code in `?n=`, because there is nowhere else to put it.
 */
export function publicCardUrlWithNote(card: { publicToken: string; handle?: string }, note: string): string {
  const path = publicCardPathWithNote(card, note);
  const plain = publicCardUrl(card);
  if (path === publicCardPath(card)) {
    const code = note.trim().toLowerCase();
    if (!isNoteCode(code)) return plain;
    const join = plain.includes("?") ? "&" : "?";
    return `${plain}${join}n=${encodeURIComponent(code)}`;
  }
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
