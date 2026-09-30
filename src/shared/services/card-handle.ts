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

export const HANDLE_RE = /^[a-z0-9]+(?:-[0-9]+)?$/;

export function slugFromName(name: string): string {
  let latin = "";
  for (const char of name.trim().toLowerCase()) {
    latin += CYRILLIC[char] ?? char;
  }
  return latin.replace(/[^a-z0-9]/g, "");
}

/** Second card with the same slug is `-2`, then `-3`. */
export function uniqueHandle(base: string, taken: Set<string>): string {
  const root = base.toLowerCase();
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

/**
 * Fill `handle` from the display name.
 * An existing handle stays until the name changes (`refresh`).
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
  const handle = uniqueHandle(base, taken);
  return handle === card.handle ? card : { ...card, handle };
}

export function handlesForCards(cards: Card[], refresh = false): Card[] {
  const next: Card[] = [];
  for (const card of cards) next.push(assignHandle(card, next, refresh || !card.handle?.trim()));
  return next;
}
