import { createHmac, timingSafeEqual } from "node:crypto";

const LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function key(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("wallet link key missing");
  return createHmac("sha256", secret).update("aded-wallet-link").digest("hex");
}

function sign(cardId: string, expires: number): string {
  return createHmac("sha256", key()).update(`${cardId}.${expires}`).digest("base64url");
}

/** The welcome mail's Add to Apple Wallet: the pass of this card, without a sign-in, for 30 days. */
export function walletLinkPath(cardId: string, now = Date.now()): string {
  const expires = now + LINK_TTL_MS;
  return `/api/cards/${encodeURIComponent(cardId)}/pass?e=${expires}&s=${sign(cardId, expires)}`;
}

export function walletLinkValid(cardId: string, rawExpires: string | null, signature: string | null): boolean {
  const expires = Number(rawExpires);
  if (!signature || !Number.isSafeInteger(expires) || expires < Date.now()) return false;
  const expected = Buffer.from(sign(cardId, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
