/**
 * The address a person can open. On Render `request.url` is the container
 * (`srv-…:10000`), so it comes last.
 */
export function publicOrigin(request: Request): string {
  const canonical = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (canonical && /^https?:\/\//i.test(canonical)) return canonical;

  const host = first(request.headers.get("x-forwarded-host"));
  const proto = first(request.headers.get("x-forwarded-proto")) ?? "https";
  if (host) return `${proto}://${host}`;

  return new URL(request.url).origin;
}

/** A sign-in link goes out by mail. Same address as every other public redirect. */
export function mailOrigin(request: Request): string {
  return publicOrigin(request);
}

function first(value: string | null): string | undefined {
  const picked = value?.split(",")[0]?.trim();
  if (!picked || /[\s/\\@]/.test(picked)) return undefined;
  return picked;
}
