import { detectContactType } from "@/shared/services/contact-item";
import { externalLineIsRed } from "@/features/contact-collect/lines";
import {
  readingExtras,
  type ContactDraftLineFlag,
  type ContactDraftSets,
} from "@/features/contact-collect/contact-reading";
import { voiceNoteText, type VoiceLineOp } from "@/features/contact-collect/voice-dialog";

/** Fields a reading may fill. The client still does not choose line types. */
export type ContactDraft = {
  displayName: string;
  position: string;
  company: string;
  note: string;
  lines: string[];
};

export type { ContactDraftLineFlag, ContactDraftSets };

/**
 * Parse API body. Old clients only read the flat fields.
 * `sets` / `lineFlags` are optional and ignored by fill-only callers.
 */
export type ContactReading = ContactDraft & {
  sets?: ContactDraftSets;
  lineFlags?: ContactDraftLineFlag[];
  lineOps?: VoiceLineOp[];
};

const NAME_MAX = 120;
const POSITION_MAX = 160;
const COMPANY_MAX = 160;
const NOTE_MAX = 500;
const LINE_MAX = 300;
const LINES_MAX = 30;

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Keep a model or a local guess inside the same limits as a saved contact. */
export function contactDraft(value: unknown): ContactDraft {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const lines: string[] = [];
  const incoming = Array.isArray(record.lines) ? record.lines : [];
  for (const item of incoming) {
    const line = clip(item, LINE_MAX);
    if (!line || externalLineIsRed(line) || lines.includes(line)) continue;
    lines.push(line);
    if (lines.length >= LINES_MAX) break;
  }
  return {
    displayName: clip(record.displayName, NAME_MAX),
    position: clip(record.position, POSITION_MAX),
    company: clip(record.company, COMPANY_MAX),
    note: clip(record.note, NOTE_MAX),
    lines,
  };
}

/**
 * Full reading for the form. Old flat JSON still works.
 * Pass allowSets:false for badge/card photos — printed text is data, not a replace command.
 */
export function contactReading(value: unknown, options?: { allowSets?: boolean }): ContactReading {
  const extras = readingExtras(value, options);
  const lineFlags = extras.lineFlags?.filter((row) => !externalLineIsRed(row.value));
  const lineOps = extras.lineOps?.filter((op) => op.op === "remove" || !externalLineIsRed(op.value));
  const draft = contactDraft(value);
  const spoken = options?.allowSets === false ? null : voiceNoteText(
    value && typeof value === "object" ? (value as { note?: unknown }).note : null,
  );
  let sets = extras.sets;
  let note = draft.note;
  if (spoken?.replace) {
    sets = { ...(sets ?? {}), note: spoken.text };
    note = "";
  } else if (spoken) {
    note = spoken.text;
  }
  return {
    ...draft,
    note,
    ...(sets && Object.keys(sets).length > 0 ? { sets } : {}),
    ...(lineFlags && lineFlags.length > 0 ? { lineFlags } : {}),
    ...(lineOps && lineOps.length > 0 ? { lineOps } : {}),
  };
}

export function contactReadingHasContent(reading: ContactReading): boolean {
  if (reading.displayName || reading.position || reading.company || reading.note || reading.lines.length) {
    return true;
  }
  if (reading.sets && Object.keys(reading.sets).length > 0) return true;
  if (reading.lineFlags && reading.lineFlags.length > 0) return true;
  if (reading.lineOps && reading.lineOps.length > 0) return true;
  return false;
}

function contactLine(value: string) {
  const kind = detectContactType(value, "contact");
  return kind !== "text" && kind !== "position" && !externalLineIsRed(value);
}

/**
 * Local provider. Contact lines stay lines. Other lines fill name, position,
 * company, then the note. The careful reading is the GPT provider.
 */
export function parseContactLocal(text: string): ContactDraft {
  const lines: string[] = [];
  const rest: string[] = [];
  for (const row of text.split(/\n+/)) {
    const line = row.trim();
    if (!line) continue;
    if (contactLine(line)) lines.push(line);
    else rest.push(line);
  }
  return contactDraft({
    displayName: rest[0] ?? "",
    position: rest[1] ?? "",
    company: rest[2] ?? "",
    note: rest.slice(3).join(" "),
    lines,
  });
}
