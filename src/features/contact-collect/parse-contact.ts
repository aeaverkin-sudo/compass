import { detectContactType } from "@/shared/services/contact-item";
import { externalLineIsRed } from "@/features/contact-collect/lines";

/** Fields a reading may fill. The client still does not choose line types. */
export type ContactDraft = {
  displayName: string;
  position: string;
  company: string;
  note: string;
  lines: string[];
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
