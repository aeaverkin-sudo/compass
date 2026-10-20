/**
 * Working screens of the signed-in owner.
 * A registered device with no live session is sent to sign-in only from these.
 * Public views (`/@handle`, `/c/`, `/e/…`, `/save/`, `/scan`, …) stay open.
 * `/` is the owner's own door, not a public card or poster.
 */
export function isOwnerAppRoute(path: string): boolean {
  const pathname = path.split("?")[0]?.split("#")[0] ?? path;
  if (pathname === "/" || pathname === "/main" || pathname.startsWith("/main/")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  if (pathname === "/account" || pathname.startsWith("/account/")) return true;
  if (/^\/e\/[^/]+\/manage(?:\/|$)/.test(pathname)) return true;
  if (pathname === "/network/c" || pathname.startsWith("/network/c/")) return false;
  if (pathname === "/network" || pathname.startsWith("/network/")) return true;
  return false;
}
