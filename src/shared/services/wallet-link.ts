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

function signedQuery(cardId: string, now: number) {
  const expires = now + LINK_TTL_MS;
  return `e=${expires}&s=${sign(cardId, expires)}`;
}

/** The page the mail opens. It checks the live Wallet status, then offers the same signed pass. */
export function walletAddPath(cardId: string, now = Date.now()): string {
  return `/wallet/add?card=${encodeURIComponent(cardId)}&${signedQuery(cardId, now)}`;
}

export function walletLinkValid(cardId: string, rawExpires: string | null, signature: string | null): boolean {
  const expires = Number(rawExpires);
  if (!signature || !Number.isSafeInteger(expires) || expires < Date.now()) return false;
  const expected = Buffer.from(sign(cardId, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
