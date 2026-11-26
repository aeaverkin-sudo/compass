import { externalLineIsRed } from "@/features/contact-collect/lines";
import { contactLineKey, draftLineKind, type DraftLine } from "@/features/contact-collect/merge-contact-draft";
import { applySpokenTightening, spokenMeetingNote } from "@/features/contact-collect/voice-dialog";
import { speakContactValue } from "@/features/contact-collect/voice-reading";

/** Messenger marks. Voice only adds them. */
export type VoiceFlag = "wa" | "tg";

export type VoiceContact = {
  lineId: string | null;
  kind: string;
  value: string;
  flags: VoiceFlag[];
};

export type VoiceNote = {
  event: string;
  place: string;
  context: string;
  replace: boolean;
};

/** The whole form the model returns. `unclear` is kept and not shown. */
export type VoiceReply = {
  displayName: string;
  position: string;
  company: string;
  contacts: VoiceContact[];
  note: VoiceNote;
  removed: string[];
  unclear: string[];
};

export type VoiceFormState = {
  displayName: string;
  position: string;
  company: string;
  note: string;
  lines: DraftLine[];
};

const NAME_MAX = 120;
const POSITION_MAX = 160;
const COMPANY_MAX = 160;
const NOTE_MAX = 500;
const LINE_MAX = 300;
const LINES_MAX = 30;

const KINDS = new Set(["phone", "email", "telegram", "whatsapp", "instagram", "link", "other"]);

const FLAG_SCHEMA = { type: "string", enum: ["wa", "tg"] };

const CONTACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    lineId: { type: ["string", "null"] },
    kind: { type: "string", enum: ["phone", "email", "telegram", "whatsapp", "instagram", "link", "other"] },
    value: { type: "string" },
    flags: { type: "array", items: FLAG_SCHEMA },
  },
  required: ["lineId", "kind", "value", "flags"],
};

const NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    event: { type: "string" },
    place: { type: "string" },
    context: { type: "string" },
    replace: {
      type: "boolean",
      description: "True only when the speaker asks to correct or delete the note.",
    },
  },
  required: ["event", "place", "context", "replace"],
};

/** Sent to OpenAI as a strict json_schema. Every object lists every field. */
export const voiceResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    displayName: { type: "string" },
    position: { type: "string" },
    company: { type: "string" },
    contacts: { type: "array", items: CONTACT_SCHEMA },
    note: NOTE_SCHEMA,
    removed: { type: "array", items: { type: "string" } },
    unclear: { type: "array", items: { type: "string" } },
  },
  required: ["displayName", "position", "company", "contacts", "note", "removed", "unclear"],
};

export function voiceResponseFormat() {
  return {
    type: "json_schema" as const,
    json_schema: { name: "voice_form", strict: true, schema: voiceResponseSchema },
  };
}

function clip(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function clipNote(value: string) {
  return value.trim().slice(0, NOTE_MAX);
}

function flagsOf(value: unknown): VoiceFlag[] {
  if (!Array.isArray(value)) return [];
  const flags: VoiceFlag[] = [];
  for (const flag of value) {
    if (flag !== "wa" && flag !== "tg") return [];
    if (!flags.includes(flag)) flags.push(flag);
  }
  return flags;
}

function addFlags(current: VoiceFlag[], extra: VoiceFlag[]): VoiceFlag[] {
  const next = [...current];
  for (const flag of extra) {
    if (!next.includes(flag)) next.push(flag);
  }
  return next;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? clip(value, max) : null;
}

function strings(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const rows: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    rows.push(item.slice(0, max));
    if (rows.length >= LINES_MAX) break;
  }
  return rows;
}

/** Null when the model JSON is not the strict form. The form is then left as it was. */
export function readVoiceReply(value: unknown, transcript: string): VoiceReply | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const displayName = text(record.displayName, NAME_MAX);
  const position = text(record.position, POSITION_MAX);
  const company = text(record.company, COMPANY_MAX);
  const removed = strings(record.removed, 80);
  const unclear = strings(record.unclear, 80);
  const noteRecord = record.note;
  if (
    displayName == null ||
    position == null ||
    company == null ||
    !removed ||
    !unclear ||
    !noteRecord ||
    typeof noteRecord !== "object" ||
    Array.isArray(noteRecord)
  ) {
    return null;
  }
  const note = noteRecord as Record<string, unknown>;
  const event = text(note.event, 160);
  const place = text(note.place, 160);
  const context = text(note.context, NOTE_MAX);
  if (event == null || place == null || context == null || typeof note.replace !== "boolean") return null;
  if (!Array.isArray(record.contacts)) return null;

  const contacts: VoiceContact[] = [];
  const orphans: VoiceFlag[] = [];
  for (const item of record.contacts) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (!(row.lineId === null || typeof row.lineId === "string")) return null;
    if (typeof row.kind !== "string" || !KINDS.has(row.kind)) return null;
    if (typeof row.value !== "string") return null;
    if (!Array.isArray(row.flags) || row.flags.some((flag) => flag !== "wa" && flag !== "tg")) return null;
    const spoken = speakContactValue(row.value);
    if (spoken === "drop") continue;
    const flags = flagsOf(row.flags);
    if (spoken === "keep") {
      const kept = applySpokenTightening(transcript, clip(row.value, LINE_MAX));
      if (kept) contacts.push({ lineId: row.lineId, kind: row.kind, value: kept, flags });
      continue;
    }
    if (!spoken.value) {
      orphans.push(...spoken.flags, ...flags);
      continue;
    }
    const next = applySpokenTightening(transcript, clip(spoken.value, LINE_MAX));
    if (!next) continue;
    contacts.push({
      lineId: row.lineId,
      kind: row.kind,
      value: next,
      flags: addFlags(flags, spoken.flags),
    });
    if (contacts.length >= LINES_MAX) break;
  }

  const phones = contacts.filter((contact) => draftLineKind(contact.value) === "phone");
  if (orphans.length > 0 && phones.length === 1) {
    phones[0]!.flags = addFlags(phones[0]!.flags, orphans);
  }

  return {
    displayName,
    position,
    company,
    contacts,
    note: { event, place, context, replace: note.replace },
    removed,
    unclear,
  };
}

function appendNote(current: string, incoming: string) {
  const next = incoming.trim();
  if (!next) return current;
  const cur = current.trim();
  if (!cur) return next;
  if (cur.toLowerCase().includes(next.toLowerCase())) return current;
  if (next.toLowerCase().includes(cur.toLowerCase())) return next;
  return `${cur}\n${next}`;
}

function addLine(lines: DraftLine[], value: string, flags: VoiceFlag[]) {
  const key = contactLineKey(value);
  const existing = lines.find((line) => contactLineKey(line.value) === key);
  if (existing) {
    if (draftLineKind(existing.value) === "phone") existing.flags = addFlags(existing.flags, flags);
    return;
  }
  if (lines.length >= LINES_MAX) return;
  lines.push({ id: crypto.randomUUID(), value, flags: draftLineKind(value) === "phone" ? flags : [] });
}

function sameFlags(left: VoiceFlag[], right: VoiceFlag[]) {
  return left.length === right.length && left.every((flag, index) => flag === right[index]);
}

function sameState(before: VoiceFormState, after: VoiceFormState) {
  if (
    before.displayName !== after.displayName ||
    before.position !== after.position ||
    before.company !== after.company ||
    before.note !== after.note ||
    before.lines.length !== after.lines.length
  ) {
    return false;
  }
  return before.lines.every((line, index) => {
    const next = after.lines[index];
    return next?.id === line.id && next.value === line.value && sameFlags(line.flags, next.flags);
  });
}

/**
 * Compare the form before this recording with the model's full form.
 * A field left empty stays. A missing line stays. Flags are only added.
 */
export function applyVoiceForm(before: VoiceFormState, reply: VoiceReply): { state: VoiceFormState; changed: boolean } {
  let displayName = before.displayName;
  let position = before.position;
  let company = before.company;
  let note = before.note;
  const lines = before.lines.map((line) => ({ id: line.id, value: line.value, flags: [...line.flags] }));

  const name = clip(reply.displayName, NAME_MAX);
  if (name && name !== displayName.trim()) displayName = name;
  const role = clip(reply.position, POSITION_MAX);
  if (role && role !== position.trim()) position = role;
  const firm = clip(reply.company, COMPANY_MAX);
  if (firm && firm !== company.trim()) company = firm;

  const removeId = reply.removed.find((id) => lines.some((line) => line.id === id));
  if (removeId) {
    const index = lines.findIndex((line) => line.id === removeId);
    if (index >= 0) lines.splice(index, 1);
  }

  for (const contact of reply.contacts) {
    const value = clip(contact.value, LINE_MAX);
    if (!value || externalLineIsRed(value)) continue;
    const kind = draftLineKind(value);
    const flags = kind === "phone" ? flagsOf(contact.flags) : [];
    const byId = contact.lineId ? lines.find((line) => line.id === contact.lineId) : undefined;
    if (byId) {
      if (draftLineKind(byId.value) === kind) {
        byId.value = value;
        byId.flags = addFlags(byId.flags, flags);
        continue;
      }
      addLine(lines, value, flags);
      continue;
    }
    addLine(lines, value, flags);
  }

  const spoken = spokenMeetingNote(reply.note.event, reply.note.place, reply.note.context);
  if (reply.note.replace) note = clipNote(spoken);
  else if (spoken) note = clipNote(appendNote(note, spoken));

  const state = { displayName, position, company, note, lines };
  return { state, changed: !sameState(before, state) };
}
