/** Stable public link. Editing the card does not change this token. */
export function publicCardUrl(publicToken: string): string {
  const path = `/c/${publicToken}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
