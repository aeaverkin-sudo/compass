export type ScanKey =
  | { kind: "badge"; token: string }
  | { kind: "card"; token: string }
  | { kind: "handle"; handle: string };

const TOKEN = /^[A-Za-z0-9_-]{21}$/;
const HANDLE = /^[a-z0-9][a-z0-9._-]{0,62}$/;

function segment(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * What the door scanner read: an event badge `/e/{code}/b/{reg_token}`,
 * a card `/c/{publicToken}` or `/c/h/{handle}`, a pretty `/@handle`,
 * with or without `?src=qr`, or a bare badge token.
 */
export function scanKeyFromQr(text: string): ScanKey | null {
  const trimmed = text.trim();
  if (TOKEN.test(trimmed)) return { kind: "badge", token: trimmed };
  let path: string;
  try {
    path = new URL(trimmed, "https://adedme.com").pathname;
  } catch {
    return null;
  }

  const badge = segment(path.match(/\/b\/([^/]+)\/?$/)?.[1]);
  if (badge && TOKEN.test(badge)) return { kind: "badge", token: badge };

  const named = segment(path.match(/^\/c\/h\/([^/]+)\/?$/)?.[1]) ?? segment(path.match(/^\/(?:@|%40)([^/]+)\/?$/i)?.[1]);
  if (named) {
    const handle = named.replace(/^@/, "").toLowerCase();
    return HANDLE.test(handle) ? { kind: "handle", handle } : null;
  }

  const card = segment(path.match(/^\/c\/([^/]+)\/?$/)?.[1]);
  if (card && TOKEN.test(card)) return { kind: "card", token: card };
  return null;
}

/** One string per scan, so the same QR held in front of the camera is sent once. */
export function scanKeyId(key: ScanKey): string {
  return key.kind === "handle" ? `h:${key.handle}` : `${key.kind === "badge" ? "b" : "c"}:${key.token}`;
}
