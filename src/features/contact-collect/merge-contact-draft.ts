import type { ContactDraft, ContactReading } from "./parse-contact.ts";
import type { ScannedContact } from "./scan-qr.ts";
import type { LineFlag } from "./types.ts";
import type { VoiceField, VoiceLineOp } from "./voice-dialog.ts";

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
    /** Replace one contact line with a value of the same kind. Otherwise the value is added. */
    line?: { from?: string; to: string };
  };
  lineFlags?: { value: string; flags: LineFlag[] }[];
  /** Voice only. Checked here: a replace must match the line's kind. */
  lineOps?: VoiceLineOp[];
};

/** Which voice edit this utterance landed on. Not written to the draft. */
export type VoiceCursor = {
  line: number | null;
  field: VoiceField | null;
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
  if (patch.lineOps && patch.lineOps.length > 0) return true;
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

function rememberField(cursor: VoiceCursor | undefined, field: VoiceField) {
  if (cursor) cursor.field = field;
}

function appendLine(lines: DraftLine[], value: string) {
  const key = contactLineKey(value);
  if (lines.some((line) => contactLineKey(line.value) === key)) return false;
  if (lines.length >= LINES_MAX) return false;
  lines.push({ id: crypto.randomUUID(), value, flags: [] });
  return true;
}

/** One line of this kind, or the last voice line when it matches. Otherwise no target. */
function replaceIndex(lines: DraftLine[], op: Extract<VoiceLineOp, { op: "replace" }>, lastVoiceLine: number | null) {
  const kind = draftLineKind(op.value);
  if (op.n != null) {
    const index = op.n - 1;
    if (index < 0 || index >= lines.length) return null;
    if (draftLineKind(lines[index]!.value) !== kind) return null;
    return index;
  }
  const matches = lines.flatMap((line, index) => (draftLineKind(line.value) === kind ? [index] : []));
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1 && lastVoiceLine != null && matches.includes(lastVoiceLine - 1)) return lastVoiceLine - 1;
  return null;
}

function applyLineOps(lines: DraftLine[], ops: VoiceLineOp[], cursor: VoiceCursor | undefined) {
  let removed = false;
  for (const op of ops) {
    if (op.op === "remove") {
      if (removed) continue;
      const index = op.n - 1;
      if (index < 0 || index >= lines.length) continue;
      removed = true;
      lines.splice(index, 1);
      if (!cursor || cursor.line == null) continue;
      if (cursor.line === op.n) cursor.line = null;
      else if (cursor.line > op.n) cursor.line -= 1;
      continue;
    }
    const value = op.value.trim();
    if (!value) continue;
    if (op.op === "add") {
      if (appendLine(lines, value) && cursor) cursor.line = lines.length;
      continue;
    }
    const index = replaceIndex(lines, op, cursor?.line ?? null);
    if (index == null) {
      if (appendLine(lines, value) && cursor) cursor.line = lines.length;
      continue;
    }
    lines[index]!.value = value;
    if (cursor) cursor.line = index + 1;
  }
}

/** Apply a recognition patch to the current draft. Does not touch Save. */
export function mergeContactDraft(
  state: ContactDraftState,
  patch: ContactDraftPatch,
  cursor?: VoiceCursor,
): ContactDraftState {
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
      rememberField(cursor, "displayName");
    }
    if (typeof sets.position === "string" && sets.position.trim()) {
      position = sets.position.trim();
      rememberField(cursor, "position");
    }
    if (typeof sets.company === "string" && sets.company.trim()) {
      company = sets.company.trim();
      rememberField(cursor, "company");
    }
    if (typeof sets.note === "string" && sets.note.trim()) {
      note = sets.note.trim();
      rememberField(cursor, "note");
    }
    if (sets.line && typeof sets.line.to === "string" && sets.line.to.trim()) {
      const to = sets.line.to.trim();
      const from = typeof sets.line.from === "string" ? sets.line.from.trim() : "";
      const toKind = draftLineKind(to);
      let replaced = false;
      if (!from) {
        const phones = lines.filter((line) => phoneKey(line.value));
        if (phones.length === 1 && toKind === "phone") {
          phones[0]!.value = to;
          replaced = true;
          if (cursor) cursor.line = lines.indexOf(phones[0]!) + 1;
        }
      } else {
        const key = contactLineKey(from);
        const matches = lines.filter(
          (line) => contactLineKey(line.value) === key || line.value.trim() === from,
        );
        if (matches.length === 1 && draftLineKind(matches[0]!.value) === toKind) {
          matches[0]!.value = to;
          replaced = true;
          if (cursor) cursor.line = lines.indexOf(matches[0]!) + 1;
        }
      }
      if (!replaced && appendLine(lines, to) && cursor) cursor.line = lines.length;
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

  if (patch.lineOps && patch.lineOps.length > 0) {
    applyLineOps(lines, patch.lineOps, cursor);
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
  if (reading.lineOps && reading.lineOps.length > 0) {
    patch.lineOps = reading.lineOps;
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
