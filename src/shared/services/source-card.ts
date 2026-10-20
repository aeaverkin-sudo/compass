/** Public token of the card someone was viewing when they started Sign up. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function sourceCardToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const token = raw.trim();
  return TOKEN_RE.test(token) ? token : null;
}
