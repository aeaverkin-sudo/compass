import { publicCardPath } from "@/shared/services/public-card-url";

/**
 * What the Wallet passes carry, without the signing (ТЗ 35 builds the file).
 * Back fields are full URLs: Wallet makes them tappable and opens Safari.
 */

export type WalletBackField = { key: string; label: string; value: string };

function eventKey(event: { slug: string | null; code: string }): string {
  return encodeURIComponent(event.slug?.trim() || event.code);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One personal pass per person, made from the primary card (`cards.is_primary`).
 * Put in Wallet on another card moves the primary flag and issues a new pass with that card's QR.
 * An event pass is a second, separate pass with the QR of the same primary card;
 * the door scanner takes any card of a registered owner.
 */
export function walletCardQr(origin: string, card: { publicToken: string; handle?: string }): string {
  return `${origin}${publicCardPath(card)}`;
}

/** A guest's event pass expires with the account (purge_at). A member's, a day after the event ends. */
export function eventPassExpiry(input: { guestPurgeAt: string | null; eventEnd: number }): string {
  if (input.guestPurgeAt) return new Date(input.guestPurgeAt).toISOString();
  return new Date(input.eventEnd + DAY_MS).toISOString();
}

/** The guest's pass: both links carry the personal token, so Safari enters the pass by itself. */
export function guestPassBackFields(origin: string, event: { slug: string | null; code: string }, token: string): WalletBackField[] {
  return [
    { key: "scan", label: "Scan a card", value: `${origin}/scan?g=${token}` },
    { key: "portfolio", label: "My portfolio", value: `${origin}/e/${eventKey(event)}?g=${token}&go=1` },
  ];
}
