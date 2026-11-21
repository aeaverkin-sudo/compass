import { detectContactType } from "@/shared/services/contact-item";
import { entryLineIsRed } from "@/shared/services/entry-line";
import {
  CONTACT_ABOUT_MAX,
  CONTACT_FILE_LIMIT,
  CONTACT_LINK_LIMIT,
  CONTACT_LINK_MAX,
  extraKeyMode,
} from "@/features/contact-collect/contact-files";
import {
  CONTACT_SOURCES,
  type ContactFileRef,
  type ContactLink,
  type ContactSource,
  type ExternalContactInput,
  type ExternalLine,
  type HeaderField,
  type LineFlag,
} from "@/features/contact-collect/types";

const NAME_MAX = 120;
const POSITION_MAX = 160;
const COMPANY_MAX = 160;
const NOTE_MAX = 500;
const TAG_MAX = 80;
const LINE_MAX = 300;
const LINES_MAX = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Section 03 holds a phone, a messenger, an email, and a link in one list.
 * The rules stay in entryLineIsRed. A line is refused only when Contacts,
 * Social, and Web all refuse it, so a website is not judged as a phone.
 */
export function externalLineIsRed(raw: string): boolean {
  const line = raw.trim();
  if (!line) return false;
  return entryLineIsRed("contact", line) && entryLineIsRed("social", line) && entryLineIsRed("web", line);
}

function storedType(line: string): string {
  if (!entryLineIsRed("contact", line)) return detectContactType(line, "contact");
  if (!entryLineIsRed("social", line)) return detectContactType(line, "social");
  return detectContactType(line, "web");
}

export type ParsedContact = { ok: true; value: ExternalContactInput } | { ok: false; error: string };

function field(value: unknown, max: number, tooLong: string): string | { error: string } {
  if (value == null) return "";
  if (typeof value !== "string") return { error: "Expected a contact." };
  const trimmed = value.trim();
  if (trimmed.length > max) return { error: tooLong };
  return trimmed;
}

function flagsOf(value: unknown): LineFlag[] | { error: string } {
  if (value == null) return [];
  if (!Array.isArray(value)) return { error: "Unknown mark." };
  const flags: LineFlag[] = [];
  for (const flag of value) {
    if (flag !== "wa" && flag !== "tg") return { error: "Unknown mark." };
    if (!flags.includes(flag)) flags.push(flag);
  }
  return flags;
}

/** Name, plain fields, and contact lines. Pushback fields in the body are ignored. */
export function parseExternalContact(body: unknown): ParsedContact {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a contact." };
  const record = body as Record<string, unknown>;

  if (typeof record.displayName !== "string" || !record.displayName.trim()) {
    return { ok: false, error: "Add a name." };
  }
  const displayName = record.displayName.trim();
  if (displayName.length > NAME_MAX) return { ok: false, error: "The name is too long." };

  const position = field(record.position, POSITION_MAX, "The position is too long.");
  if (typeof position !== "string") return { ok: false, error: position.error };
  const company = field(record.company, COMPANY_MAX, "The company is too long.");
  if (typeof company !== "string") return { ok: false, error: company.error };
  const note = field(record.note, NOTE_MAX, "The note is too long.");
  if (typeof note !== "string") return { ok: false, error: note.error };
  const eventTag = field(record.eventTag, TAG_MAX, "The event is too long.");
  if (typeof eventTag !== "string") return { ok: false, error: eventTag.error };

  let headerField: HeaderField | null = null;
  if (record.headerField != null && record.headerField !== "") {
    if (record.headerField !== "position" && record.headerField !== "company") {
      return { ok: false, error: "Unknown header field." };
    }
    headerField = record.headerField;
  }
  if (headerField === "position" && !position) headerField = null;
  if (headerField === "company" && !company) headerField = null;

  let source: ContactSource = "manual";
  if (record.source != null) {
    if (typeof record.source !== "string" || !CONTACT_SOURCES.includes(record.source as ContactSource)) {
      return { ok: false, error: "Unknown source." };
    }
    source = record.source as ContactSource;
  }

  let photoAttachmentId: string | null = null;
  if (record.photoAttachmentId != null && record.photoAttachmentId !== "") {
    if (typeof record.photoAttachmentId !== "string" || !UUID.test(record.photoAttachmentId)) {
      return { ok: false, error: "Photo not found." };
    }
    photoAttachmentId = record.photoAttachmentId;
  }

  if (record.lines != null && !Array.isArray(record.lines)) {
    return { ok: false, error: "Expected contact lines." };
  }
  const incoming = Array.isArray(record.lines) ? record.lines : [];
  const lines: ExternalLine[] = [];
  for (const entry of incoming) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "Expected contact lines." };
    const line = entry as { value?: unknown; flags?: unknown };
    if (typeof line.value !== "string") return { ok: false, error: "Expected contact lines." };
    let value = line.value.trim();
    if (!value) continue;
    if (value.length > LINE_MAX || /[\r\n]/.test(value)) {
      return { ok: false, error: "A contact line is too long." };
    }
    if (externalLineIsRed(value)) return { ok: false, error: "One contact line is not valid." };
    const flags = flagsOf(line.flags);
    if (!Array.isArray(flags)) return { ok: false, error: flags.error };
    const type = storedType(value);
    if (type === "email") value = value.toLowerCase();
    if (flags.length > 0 && type !== "phone") return { ok: false, error: "Marks belong on a phone number." };
    if (flags.length > 0 && !value.startsWith("+")) {
      return { ok: false, error: "Marks belong on an international number." };
    }
    lines.push(flags.length > 0 ? { value, type, flags } : { value, type });
  }
  if (lines.length > LINES_MAX) return { ok: false, error: "Too many contact lines." };

  const extras = extraKeyMode(record);
  if (extras === "partial") return { ok: false, error: "Expected the extra sections." };
  let web: ContactLink[] | undefined;
  let social: ContactLink[] | undefined;
  let about: string | undefined;
  let files: ContactFileRef[] | undefined;
  if (extras === "present") {
    const webLines = linksOf(record.web, "web");
    if (!Array.isArray(webLines)) return { ok: false, error: webLines.error };
    const socialLines = linksOf(record.social, "social");
    if (!Array.isArray(socialLines)) return { ok: false, error: socialLines.error };
    const aboutText = field(record.about, CONTACT_ABOUT_MAX, "The description is too long.");
    if (typeof aboutText !== "string") return { ok: false, error: aboutText.error };
    const fileRows = filesOf(record.files);
    if (!Array.isArray(fileRows)) return { ok: false, error: fileRows.error };
    web = webLines;
    social = socialLines;
    about = aboutText;
    files = fileRows;
  }

  return {
    ok: true,
    value: {
      displayName,
      position,
      company,
      headerField,
      note,
      eventTag,
      source,
      photoAttachmentId,
      lines,
      web,
      social,
      about,
      files,
    },
  };
}

function linksOf(value: unknown, zone: "web" | "social"): ContactLink[] | { error: string } {
  if (!Array.isArray(value)) return { error: "Expected links." };
  const links: ContactLink[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return { error: "Expected links." };
    const raw = (entry as { value?: unknown }).value;
    if (typeof raw !== "string") return { error: "Expected links." };
    const text = raw.trim();
    if (!text) continue;
    if (text.length > CONTACT_LINK_MAX || /[\r\n]/.test(text)) return { error: "A link is too long." };
    if (entryLineIsRed(zone, text)) return { error: "One link is not valid." };
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (links.length >= CONTACT_LINK_LIMIT) return { error: "Too many links." };
    links.push({ value: text, type: detectContactType(text, zone) });
  }
  return links;
}

function filesOf(value: unknown): ContactFileRef[] | { error: string } {
  if (!Array.isArray(value)) return { error: "Expected files." };
  const files: ContactFileRef[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return { error: "Expected files." };
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || !UUID.test(id)) return { error: "File not found." };
    if (seen.has(id)) continue;
    seen.add(id);
    if (files.length >= CONTACT_FILE_LIMIT) return { error: "Too many files." };
    const name = (entry as { name?: unknown }).name;
    const type = (entry as { type?: unknown }).type;
    files.push({
      id,
      name: typeof name === "string" ? name.slice(0, 180) : "",
      type: typeof type === "string" ? type.slice(0, 40) : "",
    });
  }
  return files;
}
