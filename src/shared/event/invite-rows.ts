import { nanoid } from "nanoid";

export type InviteRowKind = "place" | "date" | "time" | "custom";

/** One numbered row of the ADED card invite. Base rows keep their value in the event columns. */
export type InviteRow = {
  id: string;
  kind: InviteRowKind;
  title: string;
  /** Only when typed by hand. */
  number?: string;
  /** Custom rows only. */
  value?: string;
};

export type InviteLogoLook = "frame" | "shadow";

export const INVITE_ROWS_MAX = 12;
export const INVITE_TITLE_MAX = 40;
export const INVITE_NUMBER_MAX = 4;
export const INVITE_VALUE_MAX = 500;

const BASE_TITLES: Record<Exclude<InviteRowKind, "custom">, string> = {
  place: "Location",
  date: "Date",
  time: "Time",
};

export function defaultInviteRows(): InviteRow[] {
  return (["place", "date", "time"] as const).map((kind) => ({ id: nanoid(8), kind, title: BASE_TITLES[kind] }));
}

export function newInviteRow(): InviteRow {
  return { id: nanoid(8), kind: "custom", title: "" };
}

function isKind(value: unknown): value is InviteRowKind {
  return value === "place" || value === "date" || value === "time" || value === "custom";
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, max);
}

/**
 * Rows from stored or posted JSON. A broken row is dropped, a base kind counts once.
 * `dropEmpty` also drops custom rows with nothing typed, for saving.
 */
export function readInviteRows(input: unknown, dropEmpty = false): InviteRow[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<InviteRowKind>();
  const rows: InviteRow[] = [];
  for (const raw of input) {
    if (rows.length >= INVITE_ROWS_MAX) break;
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (!isKind(entry.kind)) continue;
    if (entry.kind !== "custom" && seen.has(entry.kind)) continue;
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.slice(0, 40) : nanoid(8);
    const title = text(entry.title, INVITE_TITLE_MAX) ?? "";
    const number = text(entry.number, INVITE_NUMBER_MAX)?.trim() || undefined;
    const value = entry.kind === "custom" ? text(entry.value, INVITE_VALUE_MAX) || undefined : undefined;
    if (dropEmpty && entry.kind === "custom" && !title.trim() && !value?.trim() && !number) continue;
    if (entry.kind !== "custom") seen.add(entry.kind);
    rows.push({ id, kind: entry.kind, title, ...(number ? { number } : {}), ...(value !== undefined ? { value } : {}) });
  }
  return rows;
}

export function isInviteLogoLook(value: unknown): value is InviteLogoLook {
  return value === "frame" || value === "shadow";
}

/**
 * Numbers counted over filled rows only: 01, 02, 03… A typed number shows as typed.
 * An empty row gets its position number, which the editor greys out.
 */
export function inviteRowNumbers(rows: InviteRow[], filled: (row: InviteRow) => boolean): string[] {
  let count = 0;
  return rows.map((row, index) => {
    if (filled(row)) count += 1;
    if (row.number) return row.number;
    return String(filled(row) ? count : index + 1).padStart(2, "0");
  });
}
