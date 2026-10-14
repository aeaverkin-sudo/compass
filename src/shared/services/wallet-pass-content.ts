import { publicCardPath } from "@/shared/services/public-card-url";

/**
 * What the Wallet passes carry, without the signing (ТЗ 35 builds the file).
 * Back fields are tappable phrases that open Safari; the plain value keeps the full URL.
 */

/** `attributedValue` shows a tappable phrase; `value` keeps the address for older Wallet. */
export type WalletBackField = { key: string; label?: string; value: string; attributedValue?: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One personal pass per person, made from the primary card (`cards.is_primary`).
 * Put in Wallet on another card moves the primary flag and issues a new pass with that card's QR.
 * A guest without an account holds the event pass instead; the door scanner takes any card of a registered owner.
 */
export function walletCardQr(origin: string, card: { publicToken: string; handle?: string }): string {
  return `${origin}${publicCardPath(card)}`;
}

/** A guest's event pass expires with the account (purge_at). A member's, a day after the event ends. */
export function eventPassExpiry(input: { guestPurgeAt: string | null; eventEnd: number }): string {
  if (input.guestPurgeAt) return new Date(input.guestPurgeAt).toISOString();
  return new Date(input.eventEnd + DAY_MS).toISOString();
}
