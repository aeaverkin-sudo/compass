import { HANDLE_RE } from "@/shared/services/card-handle";

/** Same token shape as `public-card.ts`. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

const OURS = new Set(["adedme.com", "www.adedme.com"]);

export type ScannedCard = { token: string } | { handle: string };

function hostOk(hostname: string, origin: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (OURS.has(host)) return true;
  try {
    return host === new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function asUrl(text: string, origin: string): URL | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed);
    if (trimmed.startsWith("/")) return new URL(trimmed, origin);
    if (/^(?:www\.)?adedme\.com(?:\/|$)/i.test(trimmed)) return new URL(`https://${trimmed}`);
    return null;
  } catch {
    return null;
  }
}

/**
 * A portfolio link we can open inside the app.
 * Accepts `/c/{token}` and `/@handle` on adedme.com or this origin.
 */
export function cardLinkFromScan(text: string, origin: string): ScannedCard | null {
  const url = asUrl(text, origin);
  if (!url || !hostOk(url.hostname, origin)) return null;
  let path = url.pathname;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  const token = path.match(/^\/c\/([^/]+)\/?$/)?.[1];
  if (token && TOKEN_RE.test(token)) return { token };
  const handle = path.match(/^\/@([^/]+)\/?$/)?.[1]?.toLowerCase();
  if (handle && HANDLE_RE.test(handle)) return { handle };
  return null;
}
