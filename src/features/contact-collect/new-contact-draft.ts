/** One unfinished New contact for this account, in this browser. No expiry. */

const NAME_MAX = 120;
const POSITION_MAX = 160;
const COMPANY_MAX = 160;
const NOTE_MAX = 500;
const LINE_MAX = 300;
const LINES_MAX = 30;
const PHOTO_MAX = 1_500_000;

export type ContactDraftLine = { value: string; flags: Array<"wa" | "tg"> };

export type ContactDraftRecord = {
  name: string;
  position: string;
  company: string;
  headerField: "position" | "company" | null;
  note: string;
  lines: ContactDraftLine[];
  photo: string | null;
  source: "manual" | "scan" | "voice" | "photo";
};

export function contactDraftKey(ownerId: string) {
  return `aded-new-contact:${ownerId}`;
}

export function contactDraftIsEmpty(draft: ContactDraftRecord) {
  return (
    !draft.name.trim() &&
    !draft.position.trim() &&
    !draft.company.trim() &&
    !draft.note.trim() &&
    draft.lines.every((line) => !line.value.trim()) &&
    !draft.photo
  );
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function flagsOf(value: unknown): Array<"wa" | "tg"> {
  if (!Array.isArray(value)) return [];
  const flags: Array<"wa" | "tg"> = [];
  for (const item of value) {
    if ((item === "wa" || item === "tg") && !flags.includes(item)) flags.push(item);
  }
  return flags;
}

function linesOf(value: unknown): ContactDraftLine[] | null {
  if (!Array.isArray(value) || value.length > LINES_MAX) return null;
  const lines: ContactDraftLine[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as { value?: unknown; flags?: unknown };
    const text = clip(record.value, LINE_MAX);
    if (!text.trim()) continue;
    lines.push({ value: text, flags: flagsOf(record.flags) });
  }
  return lines;
}

function photoOf(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !value.startsWith("data:image/") || value.length > PHOTO_MAX) return null;
  return value;
}

/** A stored record, or null when the text is not a draft. */
export function parseContactDraft(raw: string): ContactDraftRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Partial<ContactDraftRecord>;
  const lines = linesOf(record.lines);
  if (!lines) return null;
  const source =
    record.source === "scan" || record.source === "voice" || record.source === "photo" || record.source === "manual"
      ? record.source
      : "manual";
  const position = clip(record.position, POSITION_MAX);
  const company = clip(record.company, COMPANY_MAX);
  const headerField =
    record.headerField === "position" && position.trim()
      ? "position"
      : record.headerField === "company" && company.trim()
        ? "company"
        : null;
  return {
    name: clip(record.name, NAME_MAX),
    position,
    company,
    headerField,
    note: clip(record.note, NOTE_MAX),
    lines,
    photo: photoOf(record.photo),
    source,
  };
}

function browserStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

export function readContactDraft(ownerId: string): ContactDraftRecord | null {
  const storage = browserStorage();
  if (!storage || !ownerId) return null;
  const key = contactDraftKey(ownerId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = parseContactDraft(raw);
    if (!draft) {
      storage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeContactDraft(ownerId: string, draft: ContactDraftRecord) {
  const storage = browserStorage();
  if (!storage || !ownerId) return;
  const key = contactDraftKey(ownerId);
  const stored = parseContactDraft(JSON.stringify(draft)) ?? draft;
  try {
    storage.setItem(key, JSON.stringify(stored));
  } catch {
    try {
      storage.setItem(key, JSON.stringify({ ...stored, photo: null }));
    } catch {
      // The form still holds the text. A full store stays on this page only.
    }
  }
}

export function clearContactDraft(ownerId: string) {
  const storage = browserStorage();
  if (!storage || !ownerId) return;
  try {
    storage.removeItem(contactDraftKey(ownerId));
  } catch {
    // The next empty form drops it again.
  }
}
