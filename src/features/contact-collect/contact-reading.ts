import type { LineFlag } from "./types.ts";

const NAME_MAX = 120;
const POSITION_MAX = 160;
const COMPANY_MAX = 160;
const NOTE_MAX = 500;
const LINE_MAX = 300;
const LINES_MAX = 30;

/** Explicit replace ops after validation. */
export type ContactDraftSets = {
  displayName?: string;
  position?: string;
  company?: string;
  note?: string;
  line?: { from?: string; to: string };
};

export type ContactDraftLineFlag = {
  value: string;
  flags: LineFlag[];
};

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function flagsOf(value: unknown): LineFlag[] {
  if (!Array.isArray(value)) return [];
  const flags: LineFlag[] = [];
  for (const flag of value) {
    if (flag !== "wa" && flag !== "tg") continue;
    if (!flags.includes(flag)) flags.push(flag);
  }
  return flags;
}

/** Soft gate before Save: empty and flag-less rows are dropped here. */
function usableLine(value: string) {
  return value.trim().length > 0;
}

/**
 * Validate sets from the model. Empty / unknown targets are dropped.
 * Ambiguity of `line.from` is decided later by the merge engine.
 */
export function contactDraftSetsOf(value: unknown): ContactDraftSets | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const sets: ContactDraftSets = {};

  const displayName = clip(record.displayName, NAME_MAX);
  if (displayName) sets.displayName = displayName;
  const position = clip(record.position, POSITION_MAX);
  if (position) sets.position = position;
  const company = clip(record.company, COMPANY_MAX);
  if (company) sets.company = company;
  const note = clip(record.note, NOTE_MAX);
  if (note) sets.note = note;

  if (record.line != null && record.line && typeof record.line === "object" && !Array.isArray(record.line)) {
    const line = record.line as { from?: unknown; to?: unknown };
    const to = clip(line.to, LINE_MAX);
    if (to && usableLine(to)) {
      const from = clip(line.from, LINE_MAX);
      sets.line = from ? { from, to } : { to };
    }
  }

  return Object.keys(sets).length > 0 ? sets : undefined;
}

export function contactLineFlagsOf(value: unknown): ContactDraftLineFlag[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: ContactDraftLineFlag[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { value?: unknown; flags?: unknown };
    const line = clip(record.value, LINE_MAX);
    const flags = flagsOf(record.flags);
    if (!line || !flags.length || !usableLine(line)) continue;
    rows.push({ value: line, flags });
    if (rows.length >= LINES_MAX) break;
  }
  return rows.length > 0 ? rows : undefined;
}

export function readingExtras(
  value: unknown,
  options?: { allowSets?: boolean },
): { sets?: ContactDraftSets; lineFlags?: ContactDraftLineFlag[] } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const lineFlags = contactLineFlagsOf(record.lineFlags);
  const sets = options?.allowSets === false ? undefined : contactDraftSetsOf(record.sets);
  return {
    ...(sets ? { sets } : {}),
    ...(lineFlags ? { lineFlags } : {}),
  };
}
