import type { LineFlag } from "./types.ts";

/**
 * Voice JSON often names a row in words: "Telegram Радиотест", a number
 * spoken in groups, "собачка" and "точка". The Contacts check only keeps a
 * finished phone, email, or service row, so these are rewritten first.
 * A value that is not one clear row is left as it was. Nothing is invented.
 */

type Flag = LineFlag;

type Num = { kind: "n"; value: number } | { kind: "hundred" } | { kind: "thousand" };

const RU: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
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
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

const NUMBER = new Map<string, Num>([
  ["ноль", { kind: "n", value: 0 }],
  ["нуль", { kind: "n", value: 0 }],
  ["zero", { kind: "n", value: 0 }],
  ["oh", { kind: "n", value: 0 }],
  ["один", { kind: "n", value: 1 }],
  ["одна", { kind: "n", value: 1 }],
  ["одно", { kind: "n", value: 1 }],
  ["one", { kind: "n", value: 1 }],
  ["два", { kind: "n", value: 2 }],
  ["две", { kind: "n", value: 2 }],
  ["two", { kind: "n", value: 2 }],
  ["три", { kind: "n", value: 3 }],
  ["three", { kind: "n", value: 3 }],
  ["четыре", { kind: "n", value: 4 }],
  ["four", { kind: "n", value: 4 }],
  ["пять", { kind: "n", value: 5 }],
  ["five", { kind: "n", value: 5 }],
  ["шесть", { kind: "n", value: 6 }],
  ["six", { kind: "n", value: 6 }],
  ["семь", { kind: "n", value: 7 }],
  ["seven", { kind: "n", value: 7 }],
  ["восемь", { kind: "n", value: 8 }],
  ["eight", { kind: "n", value: 8 }],
  ["девять", { kind: "n", value: 9 }],
  ["nine", { kind: "n", value: 9 }],
  ["десять", { kind: "n", value: 10 }],
  ["ten", { kind: "n", value: 10 }],
  ["одиннадцать", { kind: "n", value: 11 }],
  ["eleven", { kind: "n", value: 11 }],
  ["двенадцать", { kind: "n", value: 12 }],
  ["twelve", { kind: "n", value: 12 }],
  ["тринадцать", { kind: "n", value: 13 }],
  ["thirteen", { kind: "n", value: 13 }],
  ["четырнадцать", { kind: "n", value: 14 }],
  ["fourteen", { kind: "n", value: 14 }],
  ["пятнадцать", { kind: "n", value: 15 }],
  ["fifteen", { kind: "n", value: 15 }],
  ["шестнадцать", { kind: "n", value: 16 }],
  ["sixteen", { kind: "n", value: 16 }],
  ["семнадцать", { kind: "n", value: 17 }],
  ["seventeen", { kind: "n", value: 17 }],
  ["восемнадцать", { kind: "n", value: 18 }],
  ["eighteen", { kind: "n", value: 18 }],
  ["девятнадцать", { kind: "n", value: 19 }],
  ["nineteen", { kind: "n", value: 19 }],
  ["двадцать", { kind: "n", value: 20 }],
  ["twenty", { kind: "n", value: 20 }],
  ["тридцать", { kind: "n", value: 30 }],
  ["thirty", { kind: "n", value: 30 }],
  ["сорок", { kind: "n", value: 40 }],
  ["forty", { kind: "n", value: 40 }],
  ["пятьдесят", { kind: "n", value: 50 }],
  ["fifty", { kind: "n", value: 50 }],
  ["шестьдесят", { kind: "n", value: 60 }],
  ["sixty", { kind: "n", value: 60 }],
  ["семьдесят", { kind: "n", value: 70 }],
  ["seventy", { kind: "n", value: 70 }],
  ["восемьдесят", { kind: "n", value: 80 }],
  ["eighty", { kind: "n", value: 80 }],
  ["девяносто", { kind: "n", value: 90 }],
  ["ninety", { kind: "n", value: 90 }],
  ["сто", { kind: "n", value: 100 }],
  ["двести", { kind: "n", value: 200 }],
  ["триста", { kind: "n", value: 300 }],
  ["четыреста", { kind: "n", value: 400 }],
  ["пятьсот", { kind: "n", value: 500 }],
  ["шестьсот", { kind: "n", value: 600 }],
  ["семьсот", { kind: "n", value: 700 }],
  ["восемьсот", { kind: "n", value: 800 }],
  ["девятьсот", { kind: "n", value: 900 }],
  ["hundred", { kind: "hundred" }],
  ["тысяча", { kind: "thousand" }],
  ["тысячи", { kind: "thousand" }],
  ["тысяч", { kind: "thousand" }],
  ["thousand", { kind: "thousand" }],
]);

const FILLER = new Set(["и", "and", "это", "номер", "телефон", "phone", "number"]);

const LEAD: { word: string; flag?: Flag; label?: "Telegram" | "Instagram" }[] = [
  { word: "whatsapp", flag: "wa" },
  { word: "ватсап", flag: "wa" },
  { word: "вотсап", flag: "wa" },
  { word: "telegram", flag: "tg", label: "Telegram" },
  { word: "телеграмм", flag: "tg", label: "Telegram" },
  { word: "телеграм", flag: "tg", label: "Telegram" },
  { word: "tg", flag: "tg", label: "Telegram" },
  { word: "тг", flag: "tg", label: "Telegram" },
  { word: "instagram", label: "Instagram" },
  { word: "инстаграм", label: "Instagram" },
  { word: "инста", label: "Instagram" },
];
LEAD.sort((a, b) => b.word.length - a.word.length);

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const EMAIL_HINT = /собачк|собак[ауи]|@|\sat\s|точка|\sdot\s/i;

type Spoken =
  | { kind: "line"; line: string; flags: Flag[]; orphans: Flag[] }
  | { kind: "mark"; flag: Flag }
  | { kind: "drop" };

function translitToken(token: string) {
  let out = "";
  for (const ch of token.toLowerCase()) {
    if (/[a-z0-9._]/.test(ch)) {
      out += ch;
      continue;
    }
    const mapped = RU[ch];
    if (mapped) out += mapped;
  }
  return out;
}

/** Letters already in the address stay, including + and -. Only spoken at/dot are replaced. */
function addressToken(token: string) {
  let out = "";
  for (const ch of token.toLowerCase()) {
    if (/[a-z0-9._+-]/.test(ch)) {
      out += ch;
      continue;
    }
    const mapped = RU[ch];
    if (mapped) out += mapped;
  }
  return out;
}

function spokenEmail(raw: string): string | null {
  const stripped = raw.replace(/^(?:e-?mail|email|почта|имейл|мейл|адрес)\s+/i, "").trim();
  if (!EMAIL_HINT.test(stripped)) return null;
  const parts: string[] = [];
  for (const token of stripped.split(/[\s,]+/)) {
    const lower = token.toLowerCase();
    if (!lower) continue;
    if (lower === "собачка" || lower === "собака" || lower === "собаку" || lower === "at" || lower === "@") {
      parts.push("@");
      continue;
    }
    if (lower === "точка" || lower === "dot" || lower === ".") {
      parts.push(".");
      continue;
    }
    parts.push(addressToken(token.replace(/^@+|@+$/g, "")));
  }
  const email = parts.join("").replace(/\.{2,}/g, ".").replace(/@{2,}/g, "@");
  return EMAIL.test(email) ? email : null;
}

function spokenLink(raw: string): string | null {
  const match = raw.match(/https?:\/\/[^\s]+/i);
  if (!match?.[0]) return null;
  const url = match[0].replace(/[),.;]+$/, "");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

function parseGroup(words: Num[]): string | null {
  if (!words.length) return null;
  let result = 0;
  let current = 0;
  let used = false;
  const emitted: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];
    if (!word) continue;
    if (word.kind === "thousand") {
      result += (used ? current : 1) * 1000;
      current = 0;
      used = false;
      continue;
    }
    if (word.kind === "hundred") {
      current = (used ? current : 1) * 100;
      used = true;
      continue;
    }
    const scaleNext = next && (next.kind === "hundred" || next.kind === "thousand");
    if (word.value < 10 && used && current < 10 && result === 0 && !scaleNext) {
      emitted.push(String(current));
      current = word.value;
      used = true;
      continue;
    }
    current += word.value;
    used = true;
  }
  if (used) {
    if (result === 0 && current < 10 && emitted.length > 0) emitted.push(String(current));
    else emitted.push(String(result + current));
  } else if (result > 0) {
    emitted.push(String(result));
  }
  return emitted.length ? emitted.join("") : null;
}

function groupValue(words: Num[]) {
  const part = parseGroup(words);
  if (!part || /^0+$/.test(part)) return 0;
  const value = Number(part);
  return Number.isSafeInteger(value) ? value : 0;
}

/**
 * Commas split dictated groups. Without a comma, a new group starts when the
 * next words are a new hundred or thousand, not the rest of the current one.
 */
function splitNumberGroups(tokens: Num[]) {
  const groups: Num[][] = [];
  let current: Num[] = [];
  const open = () => {
    if (current.length) groups.push(current);
    current = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (!token) continue;
    const acc = groupValue(current);
    const freshHundred = token.kind === "n" && token.value < 10 && next?.kind === "hundred" && acc % 1000 >= 100;
    const freshThousand = token.kind === "n" && token.value < 10 && next?.kind === "thousand" && acc >= 10;
    const nextHundred = token.kind === "n" && token.value >= 100 && acc % 1000 >= 100;
    if (current.length && (freshHundred || freshThousand || nextHundred)) open();
    current.push(token);
  }
  if (current.length) groups.push(current);
  return groups;
}

function phoneWord(token: string) {
  const lower = token.toLowerCase();
  if (lower === "и" || lower === "and" || lower === "плюс" || lower === "plus") return "skip" as const;
  const bare = lower.startsWith("+") ? lower.slice(1) : lower;
  if (/^\d+$/.test(bare)) return bare;
  return NUMBER.get(lower) ?? null;
}

/** Every token is a digit, a number word, or a spoken plus. Nothing else to guess from. */
function looksLikePhone(raw: string) {
  const tokens = raw.trim().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((token) => token.split("-").every((part) => phoneWord(part) !== null));
}

function hasSpokenNumber(raw: string) {
  return raw
    .trim()
    .split(/[\s,;-]+/)
    .some((token) => NUMBER.has(token.toLowerCase()));
}

/** One comma group. Digit tokens keep a leading zero. Word runs stay inside this group. */
function parseSegment(segment: string): string | null {
  const tokens = segment.trim().split(/[\s-]+/).filter(Boolean);
  if (!tokens.length) return "";
  let digits = "";
  let words: Num[] = [];
  const flush = () => {
    if (!words.length) return true;
    for (const group of splitNumberGroups(words)) {
      const part = parseGroup(group);
      if (part == null) return false;
      digits += part;
    }
    words = [];
    return true;
  };
  for (const token of tokens) {
    const word = phoneWord(token);
    if (word === "skip") continue;
    if (word === null) return null;
    if (typeof word === "string") {
      if (!flush()) return null;
      digits += word;
      continue;
    }
    words.push(word);
  }
  if (!flush()) return null;
  return digits;
}

/**
 * A spoken phone, or "drop" when the line is a number phrase we cannot keep.
 * Null means this line is not a phone. Commas are group boundaries.
 */
function spokenPhone(raw: string): { digits: string; plus: boolean } | "drop" | null {
  const trimmed = raw.trim();
  if (/^\+?[\d\s().-]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return null;
    return { digits, plus: trimmed.startsWith("+") };
  }
  const attempt = looksLikePhone(trimmed);
  if (!attempt && !(hasSpokenNumber(trimmed) && /[,;]/.test(trimmed))) return null;
  const plus = /^\s*\+/.test(trimmed) || /(^|\s)(?:плюс|plus)(?=\s|,|$)/i.test(trimmed);
  const cleaned = trimmed.replace(/^\s*\+/, " ").replace(/(^|\s)(?:плюс|plus)(?=\s|,|$)/gi, " ");
  let digits = "";
  for (const segment of cleaned.split(/[,;]+/)) {
    const part = parseSegment(segment);
    if (part == null) return "drop";
    digits += part;
  }
  if (digits.length < 7 || digits.length > 15) return "drop";
  return { digits, plus };
}

function formatPhone(phone: { digits: string; plus: boolean }, source: string) {
  if (/^\+?[\d\s().-]+$/.test(source.trim())) return source.trim();
  return `${phone.plus ? "+" : ""}${phone.digits}`;
}

function stripLead(raw: string) {
  let rest = raw.trim();
  const flags: Flag[] = [];
  const labels: Array<"Telegram" | "Instagram"> = [];
  let moved = true;
  while (moved && rest) {
    moved = false;
    const filler = rest.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (FILLER.has(filler)) {
      rest = rest.slice(filler.length).trim();
      moved = true;
      continue;
    }
    for (const lead of LEAD) {
      const next = rest.slice(lead.word.length);
      if (!rest.toLowerCase().startsWith(lead.word) || (next && !/^\s/.test(next))) continue;
      rest = next.trim();
      if (lead.flag && !flags.includes(lead.flag)) flags.push(lead.flag);
      if (lead.label && !labels.includes(lead.label)) labels.push(lead.label);
      moved = true;
      break;
    }
  }
  return { rest, flags, labels };
}

function nickHandle(rest: string, label: "Telegram" | "Instagram") {
  const words = rest
    .split(/[\s,]+/)
    .map((word) => word.replace(/^@+/, ""))
    .filter((word) => word && word !== "/" && !/^собачк/i.test(word));
  if (!words.length) return null;
  const handle = words.map((word) => translitToken(word)).join("").toLowerCase();
  const pattern = label === "Instagram" ? /^[a-z][a-z0-9._]{0,29}$/ : /^[a-z][a-z0-9_]{0,29}$/;
  return pattern.test(handle) ? handle : null;
}

/** One spoken row. "keep" means the text is already a finished value. */
export function speakContactValue(raw: string): { value: string; flags: Flag[] } | "drop" | "keep" {
  const spoken = speakLine(raw);
  if (!spoken) return "keep";
  if (spoken.kind === "drop") return "drop";
  if (spoken.kind === "mark") return { value: "", flags: [spoken.flag] };
  return { value: spoken.line, flags: [...spoken.flags] };
}

function speakLine(raw: string): Spoken | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const email = spokenEmail(text);
  if (email && email !== text) return { kind: "line", line: email, flags: [], orphans: [] };
  if (email) return null;
  const lead = stripLead(text);
  if (!lead.rest) {
    const flag = lead.flags[0];
    return lead.flags.length === 1 && flag ? { kind: "mark", flag } : null;
  }
  const phone = spokenPhone(lead.rest);
  if (phone === "drop") return { kind: "drop" };
  if (phone) {
    return { kind: "line", line: formatPhone(phone, lead.rest), flags: lead.flags, orphans: [] };
  }
  const link = spokenLink(lead.rest);
  if (link) return { kind: "line", line: link, flags: [], orphans: [] };
  const label = lead.labels.includes("Instagram")
    ? "Instagram"
    : lead.labels.includes("Telegram")
      ? "Telegram"
      : null;
  if (!label) return null;
  const handle = nickHandle(lead.rest, label);
  if (!handle) return null;
  const orphans = lead.flags.filter((flag) => (label === "Telegram" ? flag !== "tg" : true));
  return { kind: "line", line: `${label} / @${handle}`, flags: [], orphans };
}

function phoneKey(line: string) {
  const trimmed = line.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

function addFlag(rows: { value: string; flags: Flag[] }[], value: string, flags: Flag[]) {
  const key = phoneKey(value) ?? value.trim().toLowerCase();
  let row = rows.find((item) => (phoneKey(item.value) ?? item.value.trim().toLowerCase()) === key);
  if (!row) {
    row = { value, flags: [] };
    rows.push(row);
  }
  for (const flag of flags) {
    if (!row.flags.includes(flag)) row.flags.push(flag);
  }
}

/** Rewrite one voice JSON object. Photos and typed text do not come through here. */
export function normalizeVoiceReading(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  const lines: string[] = [];
  const flags: { value: string; flags: Flag[] }[] = [];
  const orphans: Flag[] = [];

  const take = (raw: string) => {
    const spoken = speakLine(raw);
    if (!spoken) {
      if (raw.trim()) lines.push(raw.trim());
      return;
    }
    if (spoken.kind === "drop") return;
    if (spoken.kind === "mark") {
      orphans.push(spoken.flag);
      return;
    }
    lines.push(spoken.line);
    if (spoken.flags.length) addFlag(flags, spoken.line, spoken.flags);
    orphans.push(...spoken.orphans);
  };

  if (Array.isArray(record.lines)) {
    for (const item of record.lines) {
      if (typeof item === "string") take(item);
    }
  }

  if (Array.isArray(record.lineFlags)) {
    for (const item of record.lineFlags) {
      if (!item || typeof item !== "object") continue;
      const row = item as { value?: unknown; flags?: unknown };
      if (typeof row.value !== "string" || !Array.isArray(row.flags)) continue;
      const spoken = speakLine(row.value);
      if (spoken?.kind === "drop") continue;
      const line = spoken?.kind === "line" ? spoken.line : row.value.trim();
      const mark = row.flags.filter((flag): flag is Flag => flag === "wa" || flag === "tg");
      if (line && mark.length) addFlag(flags, line, mark);
    }
  }

  const phones = lines.map(phoneKey).filter((key): key is string => Boolean(key));
  const unique = [...new Set(phones)];
  if (unique.length === 1) {
    const value = lines.find((line) => phoneKey(line) === unique[0]) ?? unique[0];
    addFlag(flags, value, orphans);
  }

  record.lines = lines;
  if (flags.length) record.lineFlags = flags;
  return record;
}
