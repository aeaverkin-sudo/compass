/** Anonymous repeat-visit token. Not an account. */
export const VIEWER_COOKIE = "aded_viewer";
export const VIEWER_HEADER = "x-aded-viewer";

const VIEWER_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function viewerId(value: string | null | undefined): string | undefined {
  const raw = value?.trim();
  return raw && VIEWER_RE.test(raw) ? raw : undefined;
}
