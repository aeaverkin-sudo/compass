import type { Card } from "@/shared/types";

/** Lowercase Latin slug. Cyrillic is transliterated, then everything else is dropped. */
const CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  і: "i",
  ї: "yi",
  є: "ye",
  ґ: "g",
};

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** An address already given out, or a new `code-slug`. Nothing else. */
export const HANDLE_RE =
  /^(?:[a-z0-9]+(?:-[0-9]+)?|(?=[abcdefghjkmnpqrstuvwxyz23456789]*[a-z])(?=[abcdefghjkmnpqrstuvwxyz23456789]*[23456789])[abcdefghjkmnpqrstuvwxyz23456789]{3}-[a-z0-9]+)$/;

/** `k7m-sergeyivanov` is a new address. `anna` and `anna-2` are not: the code is the first three signs. */
export function splitCodedHandle(handle: string): { code: string; slug: string } | null {
  const match = handle
    .trim()
    .toLowerCase()
    .match(
      /^(?=[abcdefghjkmnpqrstuvwxyz23456789]*[a-z])(?=[abcdefghjkmnpqrstuvwxyz23456789]*[23456789])([abcdefghjkmnpqrstuvwxyz23456789]{3})-([a-z0-9]+)$/,
    );
  if (!match) return null;
  return { code: match[1], slug: match[2] };
}

function randomCodeChar(): string {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  const bytes = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(bytes);
    if (bytes[0] < limit) return CODE_ALPHABET[bytes[0] % CODE_ALPHABET.length];
  }
}

/** Three signs. Always one letter and one digit, so the address cannot spell a section of the site. */
export function handleCode(): string {
  for (;;) {
    const code = randomCodeChar() + randomCodeChar() + randomCodeChar();
    if (/[a-z]/.test(code) && /[23456789]/.test(code)) return code;
  }
}

export function codedHandle(slug: string): string {
  return `${handleCode()}-${slug}`;
}

export function isHandleConflict(error: { code?: string; message?: string; details?: string | null } | null): boolean {
  if (!error || error.code !== "23505") return false;
  return /handle/i.test(`${error.message ?? ""}\n${error.details ?? ""}`);
}

export function slugFromName(name: string): string {
  let latin = "";
  for (const char of name.trim().toLowerCase()) {
    latin += CYRILLIC[char] ?? char;
  }
  return latin.replace(/[^a-z0-9]/g, "");
}

/**
 * Fill `handle` from the display name.
 * An existing handle stays until the name changes (`refresh`). A new one is `code-slug`.
 */
export function assignHandle(card: Card, cards: Card[], refresh = false): Card {
  if (!refresh && card.handle?.trim()) return card;
  const base = slugFromName(card.displayName);
  if (!base) return { ...card, handle: undefined };
  const taken = new Set(
    cards
      .filter((other) => other.id !== card.id)
      .map((other) => other.handle?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  let handle = codedHandle(base);
  for (let attempt = 1; taken.has(handle) && attempt < 8; attempt += 1) handle = codedHandle(base);
  return handle === card.handle ? card : { ...card, handle };
}

export function handlesForCards(cards: Card[], refresh = false): Card[] {
  const next: Card[] = [];
  for (const card of cards) next.push(assignHandle(card, next, refresh || !card.handle?.trim()));
  return next;
}
