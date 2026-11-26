import type { ContactDraft, ContactReading } from "./parse-contact.ts";
import type { ScannedContact } from "./scan-qr.ts";
import type { LineFlag } from "./types.ts";

const LINES_MAX = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const LINK = /^(?:https?:\/\/|(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]|$))/i;
const NICK = /^([a-z][a-z0-9]*)\s*\/\s*@/i;

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
 */
export type ContactDraftPatch = {
  fills?: {
    displayName?: string;
    position?: string;
    company?: string;
    note?: string;
    lines?: string[];
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
  if (patch.lineFlags && patch.lineFlags.length > 0) return true;
  return false;
}

function phoneKey(value: string): string | null {
  const digits = phoneDigits(value);
  return digits ? `+${digits}` : null;
}

/** Phone, email, one messenger, a link, or plain text. A nick only matches its own network. */
export function draftLineKind(value: string): string {
  const trimmed = value.trim();
  if (phoneKey(trimmed)) return "phone";
  if (EMAIL.test(trimmed)) return "email";
  const nick = trimmed.match(NICK);
  if (nick?.[1]) return nick[1].toLowerCase();
  if (LINK.test(trimmed)) return "link";
  return "text";
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

/** Parse API body → patch for the form. Voice does not use this. */
export function patchFromContactDraft(draft: ContactDraft | ContactReading): ContactDraftPatch {
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
      position: found.position,
      company: found.company,
      note: found.note,
      lines: found.lines,
    },
  };
}
