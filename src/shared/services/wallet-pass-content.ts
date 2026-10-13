/**
 * What the Wallet passes carry, without the signing (ТЗ 35 builds the file).
 * Back fields are full URLs: Wallet makes them tappable and opens Safari.
 */

export type WalletBackField = { key: string; label: string; value: string };

function eventKey(event: { slug: string | null; code: string }): string {
  return encodeURIComponent(event.slug?.trim() || event.code);
}

/** The guest's pass: both links carry the personal token, so Safari enters the pass by itself. */
export function guestPassBackFields(origin: string, event: { slug: string | null; code: string }, token: string): WalletBackField[] {
  return [
    { key: "scan", label: "Scan a card", value: `${origin}/scan?g=${token}` },
    { key: "portfolio", label: "My portfolio", value: `${origin}/e/${eventKey(event)}?g=${token}&go=1` },
  ];
}
