import { customAlphabet } from "nanoid";

/** No I, L, O, 0, or 1 — those blur together in a payment comment. */
const tail = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 4);

export function makePayCode(): string {
  return `AD-${tail()}`;
}

/** Revolut checkout can take the comment in the link. Other links stay as written. */
export function payLinkWithCode(url: string, code: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "revolut.me" && !host.endsWith(".revolut.me")) return url;
    if (!parsed.searchParams.has("note")) parsed.searchParams.set("note", code);
    return parsed.toString();
  } catch {
    return url;
  }
}
