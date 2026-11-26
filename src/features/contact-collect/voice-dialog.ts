import { draftLineKind } from "./merge-contact-draft";

/** One open New contact or Edit contact form, sent with a voice note. Not stored. */
export type VoiceFlag = "wa" | "tg";

export type VoiceForm = {
  displayName: string;
  position: string;
  company: string;
  note: string;
  lines: { lineId: string; kind: string; value: string; flags: VoiceFlag[] }[];
};

const ONE_WORD =
  /(?:в одно слово|слитно|без пробелов|без дефиса|без дефисов|one word|no spaces|no hyphens|without spaces|without hyphens)/i;

/** Words in one transcription. The form session adds these up. The text itself is not stored. */
export const VOICE_WORD_LIMIT = 200;

export function spokenWordCount(transcript: string): number {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** The recording that crosses the limit is kept whole. The next one does not start. */
export function addVoiceWords(current: number, added: number): { total: number; reached: boolean } {
  const extra = Number.isFinite(added) && added > 0 ? Math.floor(added) : 0;
  const total = (Number.isFinite(current) && current > 0 ? Math.floor(current) : 0) + extra;
  return { total, reached: total >= VOICE_WORD_LIMIT };
}

function squeeze(value: string) {
  return value.replace(/[\s-]+/g, "");
}

/**
 * «В одно слово» only on an email, or on the nick after @.
 * The kind is draftLineKind. A phone, a link, and plain text stay as written.
 */
export function applySpokenTightening(transcript: string, value: string): string {
  if (!ONE_WORD.test(transcript)) return value;
  const kind = draftLineKind(value);
  if (kind === "email") return squeeze(value);
  if (kind === "phone" || kind === "link" || kind === "text") return value;
  const at = value.indexOf("@");
  if (at < 0) return value;
  return `${value.slice(0, at + 1)}${squeeze(value.slice(at + 1))}`;
}

/**
 * Event and place first, then the context. Names are already bare:
 * the caller does not keep words like "event" or "at".
 */
export function spokenMeetingNote(event: string, place: string, context: string): string {
  const head = [event, place].map((part) => part.trim()).filter(Boolean);
  const title = head.join(", ");
  const rest = context.trim().replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  if (title && rest) return `${title}. ${rest}.`;
  if (title) return `${title}.`;
  if (rest) return `${rest}.`;
  return "";
}

/** A note object from the model. A plain string stays on the fill path. */
export function voiceNoteText(value: unknown): { text: string; replace: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { event?: unknown; place?: unknown; context?: unknown; replace?: unknown };
  const event = typeof record.event === "string" ? record.event : "";
  const place = typeof record.place === "string" ? record.place : "";
  const context = typeof record.context === "string" ? record.context : "";
  const text = spokenMeetingNote(event, place, context);
  if (!text) return null;
  return { text, replace: record.replace === true };
}

/** «В одно слово» on this recording. Names and the note stay as the model wrote them. */
export function tightenVoicePayload(value: unknown, transcript: string): unknown {
  if (!ONE_WORD.test(transcript)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  if (Array.isArray(record.lines)) {
    record.lines = record.lines.map((item) =>
      typeof item === "string" ? applySpokenTightening(transcript, item) : item,
    );
  }
  if (Array.isArray(record.contacts)) {
    record.contacts = record.contacts.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const contact = { ...(item as Record<string, unknown>) };
      if (typeof contact.value === "string") contact.value = applySpokenTightening(transcript, contact.value);
      return contact;
    });
  }
  return record;
}

/** Drop a broken form. Voice then runs as if the form were empty. */
export function parseVoiceForm(raw: string): VoiceForm | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 500) : "");
  const lines: VoiceForm["lines"] = [];
  if (Array.isArray(record.lines)) {
    for (const item of record.lines) {
      if (!item || typeof item !== "object") continue;
      const row = item as { lineId?: unknown; kind?: unknown; value?: unknown; flags?: unknown };
      if (typeof row.lineId !== "string" || !row.lineId.trim()) continue;
      if (typeof row.value !== "string" || !row.value.trim()) continue;
      const flags: VoiceFlag[] = [];
      if (Array.isArray(row.flags)) {
        for (const flag of row.flags) {
          if ((flag === "wa" || flag === "tg") && !flags.includes(flag)) flags.push(flag);
        }
      }
      lines.push({
        lineId: row.lineId.slice(0, 80),
        kind: typeof row.kind === "string" ? row.kind.slice(0, 40) : "",
        value: row.value.slice(0, 300),
        flags,
      });
      if (lines.length >= 30) break;
    }
  }
  return {
    displayName: text(record.displayName),
    position: text(record.position),
    company: text(record.company),
    note: text(record.note),
    lines,
  };
}
