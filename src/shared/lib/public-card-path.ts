/**
 * A public card address. `/c/` and `/@` are the addresses already given out.
 * `/{code}/@slug` is a new card. The code is three signs and always has a letter and a digit,
 * so it cannot be a section of the site. `proxy.ts` and the browser session check both use this.
 */
const CODED_CARD_PATH =
  /^\/(?=[abcdefghjkmnpqrstuvwxyz23456789]*[a-z])(?=[abcdefghjkmnpqrstuvwxyz23456789]*[23456789])[abcdefghjkmnpqrstuvwxyz23456789]{3}\/@[a-z0-9]+\/?$/i;

export function isPublicCardPath(path: string): boolean {
  const pathname = (path.split("?")[0]?.split("#")[0] ?? path).replace(/%40/gi, "@");
  return pathname.startsWith("/c/") || pathname.startsWith("/@") || CODED_CARD_PATH.test(pathname);
}
