/** Public site origin behind Render's proxy. The request URL is the internal host. */
export function publicOrigin(request: Request): string {
  const host = first(request.headers.get("x-forwarded-host"));
  const proto = first(request.headers.get("x-forwarded-proto")) ?? "https";
  if (host) return `${proto}://${host}`;

  const canonical = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (canonical && /^https?:\/\//i.test(canonical)) return canonical;

  return new URL(request.url).origin;
}

function first(value: string | null): string | undefined {
  const picked = value?.split(",")[0]?.trim();
  if (!picked || /[\s/\\@]/.test(picked)) return undefined;
  return picked;
}
