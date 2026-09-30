/** Pretty `/@handle` when the card has one. The token URL stays as the fallback. */
export function publicCardPath(card: { publicToken: string; handle?: string }): string {
  const handle = card.handle?.trim().toLowerCase();
  if (handle) return `/@${handle}`;
  return `/c/${card.publicToken}`;
}

export function publicCardUrl(card: { publicToken: string; handle?: string }): string {
  const path = publicCardPath(card);
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
