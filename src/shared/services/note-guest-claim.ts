import { cookies } from "next/headers";

/** Opaque guest id for one browser. Survives until the hold window ends. */
export const NOTE_GUEST_COOKIE = "aded-note-guest";

/** Guest receipt + server copy wait this long for Network bind. */
export const NOTE_RECEIPT_HOLD_MS = 60 * 24 * 60 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuestClaimId(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function newGuestClaimId(): string {
  return crypto.randomUUID();
}

export function receiptExpiresAt(fromMs = Date.now()): string {
  return new Date(fromMs + NOTE_RECEIPT_HOLD_MS).toISOString();
}

/** Read or create the guest claim cookie. Call before burning a transfer. */
export async function ensureGuestClaimId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(NOTE_GUEST_COOKIE)?.value;
  if (isGuestClaimId(existing)) return existing;
  const id = newGuestClaimId();
  jar.set(NOTE_GUEST_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(NOTE_RECEIPT_HOLD_MS / 1000),
  });
  return id;
}

export async function readGuestClaimId(): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(NOTE_GUEST_COOKIE)?.value;
  return isGuestClaimId(existing) ? existing : null;
}
