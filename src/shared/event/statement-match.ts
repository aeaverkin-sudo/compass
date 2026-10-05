export type StatementGuest = {
  userId: string;
  name: string;
  payCode: string | null;
  paidStatus: string | null;
  paidSource: string | null;
};

export type UnmatchedLine = { amount: number; text: string };

export type StatementMatch = {
  byCode: string[];
  byName: string[];
  notMatched: UnmatchedLine[];
  notes: string[];
};

const CONFIRMED = new Set(["statement", "name", "manual"]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function compact(value: string): string {
  return normalize(value).replace(/ /g, "");
}

function amounts(line: string): number[] {
  const found: number[] = [];
  const pattern = /[−-]?\d{1,7}(?:[.,]\d{2})?/g;
  for (const hit of line.match(pattern) ?? []) {
    const number = Number(hit.replace("−", "-").replace(",", "."));
    if (Number.isFinite(number)) found.push(Math.abs(number));
  }
  return found;
}

/** A row looks like a payment when its amount is the ticket price times 1–5. */
export function paymentMultiple(line: string, price: number | null): { amount: number; k: number } | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  for (const amount of amounts(line)) {
    for (let k = 1; k <= 5; k += 1) {
      if (Math.abs(amount - price * k) < 0.02) return { amount, k };
    }
  }
  return null;
}

function codeTail(code: string): string | null {
  const tail = code.trim().toUpperCase().replace(/^AD-?/, "");
  return /^[A-Z0-9]{4}$/.test(tail) ? tail : null;
}

function alreadyConfirmed(guest: StatementGuest): boolean {
  return guest.paidStatus === "paid" && guest.paidSource != null && CONFIRMED.has(guest.paidSource);
}

function nameWords(name: string): string[] | null {
  const words = normalize(name).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last || first.length < 2 || last.length < 2) return null;
  return first === last ? [first] : [first, last];
}

function lineHasWords(line: string, words: string[]): boolean {
  const tokens = new Set(normalize(line).split(" ").filter(Boolean));
  return words.every((word) => tokens.has(word));
}

export function matchStatement(lines: string[], guests: StatementGuest[], price: number | null): StatementMatch {
  const byCode = new Set<string>();
  const byName = new Set<string>();
  const notes: string[] = [];
  const notMatched: UnmatchedLine[] = [];
  const claimed = new Set<string>();

  const coded = guests.flatMap((guest) => {
    if (!guest.payCode) return [];
    const tail = codeTail(guest.payCode);
    return tail ? [{ guest, tail, label: guest.payCode.toUpperCase().startsWith("AD") ? `AD-${tail}` : guest.payCode }] : [];
  });

  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;
    const folded = compact(raw);
    const hits = coded.filter((entry) => folded.includes(`AD${entry.tail}`));
    if (hits.length > 0) {
      const multiple = paymentMultiple(raw, price);
      for (const hit of hits) {
        if (!alreadyConfirmed(hit.guest) && !claimed.has(hit.guest.userId)) {
          claimed.add(hit.guest.userId);
          byCode.add(hit.guest.userId);
        }
        if (multiple && multiple.k > 1) notes.push(`${hit.label} covers ${multiple.k} guests`);
      }
      continue;
    }

    const multiple = paymentMultiple(raw, price);
    if (!multiple) continue;

    const named = guests.filter((guest) => {
      if (alreadyConfirmed(guest) || claimed.has(guest.userId)) return false;
      const words = nameWords(guest.name);
      return words ? lineHasWords(raw, words) : false;
    });
    if (named.length === 1 && named[0]) {
      claimed.add(named[0].userId);
      byName.add(named[0].userId);
      continue;
    }
    if (named.length > 1) {
      notMatched.push({ amount: multiple.amount, text: raw.slice(0, 60) });
      continue;
    }
    const covered = guests.some((guest) => {
      if (!alreadyConfirmed(guest)) return false;
      const words = nameWords(guest.name);
      return words ? lineHasWords(raw, words) : false;
    });
    if (covered) continue;
    notMatched.push({ amount: multiple.amount, text: raw.slice(0, 60) });
  }

  return { byCode: [...byCode], byName: [...byName], notMatched, notes };
}
