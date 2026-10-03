const TOKEN = /^[A-Za-z0-9_-]{21}$/;
const CODE = /^[А-Я0-9]{4,6}$/;

export function isEventLookup(value: string): boolean {
  return TOKEN.test(value) || CODE.test(value);
}

/** A pasted invite, a bare token, or a short code. Anything else is not an invite. */
export function lookupFromInvite(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const fromPath = text.match(/\/e\/([^/?#\s]+)/i);
  let candidate = text;
  if (fromPath?.[1]) {
    try {
      candidate = decodeURIComponent(fromPath[1]);
    } catch {
      candidate = fromPath[1];
    }
  }
  return isEventLookup(candidate) ? candidate : null;
}

/** The join field takes the five-character code. */
export function normalizeEventCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[А-Я0-9]{5}$/.test(code) ? code : null;
}

/** After sign-in, only this path may come back to an invite. */
export function isEventJoinPath(path: string): boolean {
  if (!path.startsWith("/e/") || path.includes("//") || path.includes("\\") || path.includes("?") || path.includes("#")) {
    return false;
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "e" || parts[2] !== "join") return false;
  let lookup = parts[1] ?? "";
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    return false;
  }
  return isEventLookup(lookup);
}
