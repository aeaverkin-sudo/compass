import type { ContactDraft, ContactReading } from "./parse-contact.ts";
import type { ScannedContact } from "./scan-qr.ts";
import type { LineFlag } from "./types.ts";

const LINES_MAX = 30;

/** Same rule as messengerPhoneDigits: leading + and digits, punctuation ignored. */
function phoneDigits(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) return null;
  const body = trimmed.slice(1);
  if (!body || !/^[\d\s().-]+$/.test(body)) return null;
  const digits = body.replace(/[\s().-]/g, "");
  return digits || null;
}

/** One contact row in the form draft. */
export type DraftLine = {
  id: string;
  value: string;
  flags: LineFlag[];
};

/** Form fields the merge engine may change. */
export type ContactDraftState = {
  displayName: string;
  position: string;
  company: string;
  note: string;
  lines: DraftLine[];
};

/**
 * A recognition result as a patch.
 * QR and badge/card reads produce `fills` (and optional `lineFlags`).
 * `sets` come from explicit Voice commands after validation.
 */
export type ContactDraftPatch = {
  fills?: {
    displayName?: string;
    position?: string;
    company?: string;
    note?: string;
    lines?: string[];
  };
  sets?: {
    displayName?: string;
    position?: string;
    company?: string;
    note?: string;
    /** Replace one contact line. Without a clear target the op is skipped. */
    line?: { from?: string; to: string };
  };
  lineFlags?: { value: string; flags: LineFlag[] }[];
};

export function patchHasContent(patch: ContactDraftPatch): boolean {
  const fills = patch.fills;
  if (
    fills &&
    (fills.displayName?.trim() ||
      fills.position?.trim() ||
      fills.company?.trim() ||
      fills.note?.trim() ||
      (fills.lines?.length ?? 0) > 0)
  ) {
    return true;
  }
  if (patch.sets && Object.keys(patch.sets).length > 0) return true;
  if (patch.lineFlags && patch.lineFlags.length > 0) return true;
  return false;
}

function phoneKey(value: string): string | null {
  const digits = phoneDigits(value);
  return digits ? `+${digits}` : null;
}

/** Same international number in different punctuation shares one key. */
export function contactLineKey(value: string): string {
  const phone = phoneKey(value);
  if (phone) return `phone:${phone}`;
  return `text:${value.trim().toLowerCase()}`;
}

function appendNote(current: string, incoming: string): string {
  const next = incoming.trim();
  if (!next) return current;
  const cur = current.trim();
  if (!cur) return next;
  if (cur.toLowerCase().includes(next.toLowerCase())) return current;
  if (next.toLowerCase().includes(cur.toLowerCase())) return next;
  return `${cur}\n${next}`;
}

function mergeFlags(current: LineFlag[], extra: LineFlag[]): LineFlag[] {
  const next = [...current];
  for (const flag of extra) {
    if (flag !== "wa" && flag !== "tg") continue;
    if (!next.includes(flag)) next.push(flag);
  }
  return next;
}

function cleanFlags(value: unknown): LineFlag[] {
  if (!Array.isArray(value)) return [];
  return mergeFlags([], value as LineFlag[]);
}

/** Apply a recognition patch to the current draft. Does not touch Save. */
export function mergeContactDraft(state: ContactDraftState, patch: ContactDraftPatch): ContactDraftState {
  let displayName = state.displayName;
  let position = state.position;
  let company = state.company;
  let note = state.note;
  const lines: DraftLine[] = state.lines.map((line) => ({
    id: line.id,
    value: line.value,
    flags: [...line.flags],
  }));

  const sets = patch.sets;
  if (sets) {
    if (typeof sets.displayName === "string" && sets.displayName.trim()) {
      displayName = sets.displayName.trim();
    }
    if (typeof sets.position === "string" && sets.position.trim()) {
      position = sets.position.trim();
    }
    if (typeof sets.company === "string" && sets.company.trim()) {
      company = sets.company.trim();
    }
    if (typeof sets.note === "string" && sets.note.trim()) {
      note = sets.note.trim();
    }
    if (sets.line && typeof sets.line.to === "string" && sets.line.to.trim()) {
      const to = sets.line.to.trim();
      const from = typeof sets.line.from === "string" ? sets.line.from.trim() : "";
      if (!from) {
        const phones = lines.filter((line) => phoneKey(line.value));
        if (phones.length === 1) phones[0]!.value = to;
      } else {
        const key = contactLineKey(from);
        const matches = lines.filter(
          (line) => contactLineKey(line.value) === key || line.value.trim() === from,
        );
        if (matches.length === 1) matches[0]!.value = to;
      }
    }
  }

  const fills = patch.fills;
  if (fills) {
    if (fills.displayName?.trim() && !displayName.trim()) displayName = fills.displayName.trim();
    if (fills.position?.trim() && !position.trim()) position = fills.position.trim();
    if (fills.company?.trim() && !company.trim()) company = fills.company.trim();
    if (fills.note?.trim()) note = appendNote(note, fills.note);
    for (const raw of fills.lines ?? []) {
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) continue;
      const key = contactLineKey(value);
      if (lines.some((line) => contactLineKey(line.value) === key)) continue;
      if (lines.length >= LINES_MAX) break;
      lines.push({ id: crypto.randomUUID(), value, flags: [] });
    }
  }

  for (const item of patch.lineFlags ?? []) {
    const value = typeof item.value === "string" ? item.value.trim() : "";
    const flags = cleanFlags(item.flags);
    if (!value || flags.length === 0) continue;
    const key = contactLineKey(value);
    const existing = lines.find((line) => contactLineKey(line.value) === key);
    if (existing) {
      existing.flags = mergeFlags(existing.flags, flags);
      continue;
    }
    if (lines.length >= LINES_MAX) continue;
    lines.push({ id: crypto.randomUUID(), value, flags });
  }

  return { displayName, position, company, note, lines };
}

/**
 * Parse API body → patch for the form.
 * `allowSets:false` drops replace commands (badge / card photo).
 */
export function patchFromContactDraft(
  draft: ContactDraft | ContactReading,
  options?: { allowSets?: boolean },
): ContactDraftPatch {
  const reading = draft as ContactReading;
  const patch: ContactDraftPatch = {
    fills: {
      displayName: draft.displayName,
      position: draft.position,
      company: draft.company,
      note: draft.note,
      lines: draft.lines,
    },
  };
  if (options?.allowSets !== false && reading.sets && Object.keys(reading.sets).length > 0) {
    patch.sets = reading.sets;
  }
  if (reading.lineFlags && reading.lineFlags.length > 0) {
    patch.lineFlags = reading.lineFlags;
  }
  return patch;
}

/** Local QR result → fill-only patch. */
export function patchFromScan(found: ScannedContact): ContactDraftPatch {
  return {
    fills: {
      displayName: found.name,
      lines: found.lines,
    },
  };
}
