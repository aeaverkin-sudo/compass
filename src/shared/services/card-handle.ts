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

/** A new address: 7 signs now, 3 already given out. A letter and a digit, then a slug. */
const CODED_HANDLE = `(?=[${CODE_ALPHABET}]*[a-z])(?=[${CODE_ALPHABET}]*[23456789])([${CODE_ALPHABET}]{7}|[${CODE_ALPHABET}]{3})-([a-z0-9]+)`;

/** An address already given out, or a `code-slug`. Nothing else. */
export const HANDLE_RE = new RegExp(`^(?:[a-z0-9]+(?:-[0-9]+)?|${CODED_HANDLE})$`);

const CODED_HANDLE_RE = new RegExp(`^${CODED_HANDLE}$`);

/** `k7m2n4p-sergeyivanov` is a new address. `anna` and `anna-2` are not. */
export function splitCodedHandle(handle: string): { code: string; slug: string } | null {
  const match = handle.trim().toLowerCase().match(CODED_HANDLE_RE);
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

/** Seven signs. Always one letter and one digit, so the address cannot spell a section of the site. */
export function handleCode(): string {
  for (;;) {
    let code = "";
    for (let index = 0; index < 7; index += 1) code += randomCodeChar();
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
 * An existing handle stays unless `refresh` is set. A new one is `code-slug`.
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

function handleTaken(cards: Card[], cardId: string, handle: string): boolean {
  return cards.some((other) => other.id !== cardId && other.handle?.trim().toLowerCase() === handle);
}

/**
 * Save and Back ask only when the address would change.
 * A coded handle is compared with its slug. A plain `/@name` is compared with the name at Edit.
 * No letters in the name, or the same slug, does not ask.
 */
export function renameChangesAddress(card: Card, nameAtEdit: string | null): boolean {
  const handle = card.handle?.trim().toLowerCase();
  if (!handle) return false;
  const next = slugFromName(card.displayName);
  if (!next) return false;
  const coded = splitCodedHandle(handle);
  if (coded) return coded.slug !== next;
  if (nameAtEdit === null) return false;
  return slugFromName(nameAtEdit) !== next;
}

/**
 * The handle after a confirmed rename.
 * Keeping the code uses the slug of the new name, so an old coded address still opens.
 * A plain `/@name` has no code: keeping it is what leaves that address working.
 * Not keeping it is a new code and a new slug. A name with no letters leaves the handle as it is.
 */
export function handleAfterRename(card: Card, cards: Card[], keepCode: boolean): string | undefined {
  const current = card.handle?.trim().toLowerCase();
  if (!current) return undefined;
  const base = slugFromName(card.displayName);
  if (!base) return current;
  if (keepCode) {
    const parts = splitCodedHandle(current);
    if (!parts) return current;
    const handle = `${parts.code}-${base}`;
    if (handle === current || handleTaken(cards, card.id, handle)) return current;
    return handle;
  }
  const next = assignHandle(card, cards, true);
  return next.handle?.trim().toLowerCase() || current;
}

export function handlesForCards(cards: Card[], refresh = false): Card[] {
  const next: Card[] = [];
  for (const card of cards) next.push(assignHandle(card, next, refresh || !card.handle?.trim()));
  return next;
}
