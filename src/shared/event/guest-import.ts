export const GUEST_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const GUEST_FILE_MAX_ROWS = 2000;
/** The shorter number must keep this many digits to count as the tail of the longer one. */
export const PHONE_TAIL_DIGITS = 9;

export type ImportedGuest = { row: number; name: string; email: string | null; phone: string | null };
export type SkippedRow = { row: number; text: string };
export type GuestImport = { guests: ImportedGuest[]; skipped: SkippedRow[]; rows: number };

type Column = "full" | "first" | "last" | "email" | "phone";

const HEADERS: Record<string, Column> = {
  name: "full",
  fullname: "full",
  firstname: "first",
  имя: "first",
  nome: "first",
  lastname: "last",
  фамилия: "last",
  apelido: "last",
  email: "email",
  mail: "email",
  почта: "email",
  phone: "phone",
  mobile: "phone",
  tel: "phone",
  whatsapp: "phone",
  telefone: "phone",
  телефон: "phone",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function headerKey(cell: string): string {
  return cell.toLowerCase().replace(/[\s_.-]+/g, "");
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** Digits only. A leading + stays, a leading 00 becomes +. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  let plus = /^[\s(]*\+/.test(trimmed);
  if (!plus && digits.startsWith("00")) {
    digits = digits.slice(2);
    plus = true;
  }
  if (digits.length < 6) return null;
  return plus ? `+${digits}` : digits;
}

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Same number, or one is the other with a country code in front. */
export function phonesMatch(left: string, right: string): boolean {
  const a = phoneDigits(left);
  const b = phoneDigits(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= PHONE_TAIL_DIGITS && long.endsWith(short);
}

/** The fuller of two matching numbers, so a country code is never lost. */
export function fullerPhone(left: string, right: string): string {
  const a = phoneDigits(left);
  const b = phoneDigits(right);
  if (a.length !== b.length) return a.length > b.length ? left : right;
  return left.startsWith("+") ? left : right;
}

export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function looksLikePhone(cell: string): boolean {
  const value = cell.trim();
  if (!/^\+?[\d\s().-]+$/.test(value)) return false;
  return /^[\s(]*(\+|00)/.test(value) || phoneDigits(value).length >= PHONE_TAIL_DIGITS;
}

function readHeader(cells: string[]): Map<number, Column> | null {
  const columns = new Map<number, Column>();
  cells.forEach((cell, index) => {
    const column = HEADERS[headerKey(cell)];
    if (column && ![...columns.values()].includes(column)) columns.set(index, column);
  });
  return columns.size > 0 ? columns : null;
}

function fromHeader(cells: string[], columns: Map<number, Column>): { name: string; email: string | null; phone: string | null } {
  let full = "";
  let first = "";
  let last = "";
  let email: string | null = null;
  let phone: string | null = null;
  for (const [index, column] of columns) {
    const value = (cells[index] ?? "").trim();
    if (!value) continue;
    if (column === "full") full = value;
    else if (column === "first") first = value;
    else if (column === "last") last = value;
    else if (column === "email") email = normalizeEmail(value);
    else phone = normalizePhone(value);
  }
  const name = full || [first, last].filter(Boolean).join(" ");
  return { name: name.replace(/\s+/g, " ").trim(), email, phone };
}

function fromContent(cells: string[]): { name: string; email: string | null; phone: string | null } {
  const words: string[] = [];
  let email: string | null = null;
  let phone: string | null = null;
  for (const raw of cells) {
    const value = raw.trim();
    if (!value) continue;
    if (value.includes("@")) {
      email ??= normalizeEmail(value);
    } else if (looksLikePhone(value)) {
      phone ??= normalizePhone(value);
    } else if (/\p{L}/u.test(value)) {
      words.push(value);
    }
  }
  return { name: words.join(" ").replace(/\s+/g, " ").trim(), email, phone };
}

/**
 * One table, first row maybe a header. A row without a name, or with
 * neither an email nor a phone, is skipped and reported.
 */
export function readGuestTable(table: string[][]): GuestImport | { error: string } {
  const rows = table.map((row) => row.map((cell) => cell ?? "")).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length === 0) return { error: "That file is empty." };
  const columns = readHeader(rows[0]);
  const start = columns ? 1 : 0;
  const body = rows.slice(start);
  if (body.length > GUEST_FILE_MAX_ROWS) return { error: `Up to ${GUEST_FILE_MAX_ROWS} rows in one list.` };

  const guests: ImportedGuest[] = [];
  const skipped: SkippedRow[] = [];
  body.forEach((cells, index) => {
    const row = index + start + 1;
    const read = columns ? fromHeader(cells, columns) : fromContent(cells);
    if (!read.name || (!read.email && !read.phone)) {
      skipped.push({ row, text: cells.map((cell) => cell.trim()).filter(Boolean).join(", ").slice(0, 60) });
      return;
    }
    guests.push({ row, ...read });
  });
  return { guests, skipped, rows: body.length };
}

/** The list name a file gets by default. */
export function listNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, "").trim();
  return (base || "Guests").slice(0, 80);
}
