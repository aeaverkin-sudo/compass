import { nanoid } from "nanoid";

export type InviteBaseKind = "name" | "when" | "place" | "pic" | "about";
/** Named poster fields. Each comes once, keeps its value here and shows only when filled. */
export type InviteExtraKind = "made" | "guests" | "present";
export type InviteRowKind = InviteBaseKind | InviteExtraKind | "custom";

/**
 * One form zone. A base zone keeps only its label here; its value sits in the event columns.
 * A named field and a custom row keep both.
 */
export type InviteRow = {
  id: string;
  kind: InviteRowKind;
  title: string;
  /** Named fields and custom rows. */
  value?: string;
};

export type InviteLogoLook = "frame" | "shadow";

export const INVITE_CUSTOM_MAX = 12;
export const INVITE_TITLE_MAX = 40;
export const INVITE_VALUE_MAX = 500;

const BASE_KINDS: readonly InviteBaseKind[] = ["name", "when", "place", "pic", "about"];
export const INVITE_EXTRA_KINDS: readonly InviteExtraKind[] = ["made", "guests", "present"];
const ROWS_MAX = BASE_KINDS.length + INVITE_EXTRA_KINDS.length + INVITE_CUSTOM_MAX;

export const INVITE_BASE_LABELS: Record<InviteBaseKind, string> = {
  name: "Title",
  when: "When",
  place: "Place",
  pic: "Pic",
  about: "About",
};

export const INVITE_EXTRA_LABELS: Record<InviteExtraKind, string> = {
  made: "Made by",
  guests: "Special guests",
  present: "Secret present",
};

/** Kinds and default titles of the first card preset. Its date and time are one When now. */
const LEGACY_KINDS: Record<string, { kind: InviteBaseKind; title: string }> = {
  date: { kind: "when", title: "Date" },
  time: { kind: "when", title: "Time" },
  place: { kind: "place", title: "Location" },
};

export function newInviteRow(): InviteRow {
  return { id: nanoid(8), kind: "custom", title: "", value: "" };
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function baseKind(value: unknown): InviteBaseKind | null {
  return BASE_KINDS.find((kind) => kind === value) ?? null;
}

function extraKind(value: unknown): InviteExtraKind | null {
  return INVITE_EXTRA_KINDS.find((kind) => kind === value) ?? null;
}

/**
 * Rows from stored or posted JSON. Broken rows are dropped, a base kind counts once, numbers are ignored.
 * Old Date and Time rows become one When; their default titles become the new default.
 * `dropEmpty` also drops custom rows with nothing typed, for saving.
 */
export function readInviteRows(input: unknown, dropEmpty = false): InviteRow[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<InviteBaseKind | InviteExtraKind>();
  const rows: InviteRow[] = [];
  let custom = 0;
  for (const raw of input) {
    if (rows.length >= ROWS_MAX) break;
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.slice(0, 40) : nanoid(8);
    let title = text(entry.title, INVITE_TITLE_MAX);
    const extra = extraKind(entry.kind);
    if (extra) {
      if (seen.has(extra)) continue;
      const value = text(entry.value, INVITE_VALUE_MAX);
      seen.add(extra);
      if (dropEmpty && !value.trim()) continue;
      rows.push({ id, kind: extra, title, value });
      continue;
    }
    if (entry.kind === "custom") {
      if (custom >= INVITE_CUSTOM_MAX) continue;
      const value = text(entry.value, INVITE_VALUE_MAX);
      if (dropEmpty && !title.trim() && !value.trim()) continue;
      custom += 1;
      rows.push({ id, kind: "custom", title, value });
      continue;
    }
    const legacy = entry.kind === "date" || entry.kind === "time" ? LEGACY_KINDS[entry.kind] : null;
    const kind = legacy?.kind ?? baseKind(entry.kind);
    if (!kind || seen.has(kind)) continue;
    const oldDefault = legacy?.title ?? (kind === "place" ? LEGACY_KINDS.place!.title : null);
    if (oldDefault && title.trim() === oldDefault) title = "";
    seen.add(kind);
    if (dropEmpty && !title.trim()) continue;
    rows.push({ id, kind, title });
  }
  return rows;
}

export function isInviteLogoLook(value: unknown): value is InviteLogoLook {
  return value === "frame" || value === "shadow";
}

/** The label a zone shows: the organiser's title, or the default one. */
export function inviteLabel(rows: InviteRow[] | null | undefined, kind: InviteBaseKind): string {
  const title = rows?.find((row) => row.kind === kind)?.title.trim();
  return title || INVITE_BASE_LABELS[kind];
}

/** Rename a base zone. An empty title brings the default back. */
export function withInviteLabel(rows: InviteRow[], kind: InviteBaseKind, title: string): InviteRow[] {
  const next = title.slice(0, INVITE_TITLE_MAX);
  if (rows.some((row) => row.kind === kind)) {
    return rows.map((row) => (row.kind === kind ? { ...row, title: next } : row));
  }
  return [...rows, { id: nanoid(8), kind, title: next }];
}

export function customInviteRows(rows: InviteRow[] | null | undefined): InviteRow[] {
  return (rows ?? []).filter((row) => row.kind === "custom");
}

export function inviteExtraRow(rows: InviteRow[] | null | undefined, kind: InviteExtraKind): InviteRow | undefined {
  return rows?.find((row) => row.kind === kind);
}

/** Set a named field's label or value. The row is made on first use. */
export function withInviteExtra(rows: InviteRow[], kind: InviteExtraKind, patch: Pick<Partial<InviteRow>, "title" | "value">): InviteRow[] {
  const next = {
    ...(patch.title === undefined ? {} : { title: patch.title.slice(0, INVITE_TITLE_MAX) }),
    ...(patch.value === undefined ? {} : { value: patch.value.slice(0, INVITE_VALUE_MAX) }),
  };
  if (rows.some((row) => row.kind === kind)) {
    return rows.map((row) => (row.kind === kind ? { ...row, ...next } : row));
  }
  return [...rows, { id: nanoid(8), kind, title: "", value: "", ...next }];
}

export type PosterField = { id: string; label: string; value: string };

/**
 * The compact poster fields after Date, Time, Place and Price, in one order for every style:
 * Made by, Special guests, Secret present, then the organiser's own rows. Only filled ones.
 */
export function posterFields(rows: InviteRow[] | null | undefined): PosterField[] {
  const fields: PosterField[] = [];
  for (const kind of INVITE_EXTRA_KINDS) {
    const row = inviteExtraRow(rows, kind);
    const value = row?.value?.trim();
    if (row && value) fields.push({ id: row.id, label: row.title.trim() || INVITE_EXTRA_LABELS[kind], value });
  }
  for (const row of customInviteRows(rows)) {
    const value = row.value?.trim();
    if (value) fields.push({ id: row.id, label: row.title.trim(), value });
  }
  return fields;
}
