import "server-only";

import {
  contactReading,
  parseContactLocal,
  type ContactReading,
} from "@/features/contact-collect/parse-contact";

/**
 * Photo, voice, and messy text. The key stays in the host environment.
 * Without it, a photo or a recording is refused and text stays on the local provider.
 */

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const AUDIO_URL = "https://api.openai.com/v1/audio/transcriptions";
const MODEL = "gpt-4o-mini";
const IMAGE_MAX = 4 * 1024 * 1024;
const AUDIO_MAX = 8 * 1024 * 1024;
const TEXT_MAX = 4000;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const ASK_DATA = `Read one person into JSON only, with no markdown.
Shape: {"displayName":"","position":"","company":"","note":"","lines":[],"lineFlags":[]}
lines are phones, emails, @telegram names, or links, each one string.
lineFlags is optional: [{"value":"+44…","flags":["wa"]}] or ["tg"] when WhatsApp/Telegram is marked on the card.
Copy only what is written. Do not invent a country code. Keep a leading + if it was there.
Do not include sets. If there is no contact, return empty strings and an empty lines array.`;

const ASK_VOICE = `Turn one spoken contact update into JSON only, with no markdown.
Shape: {"displayName":"","position":"","company":"","note":"","lines":[],"sets":{},"lineFlags":[]}
Top-level fields and lines are ordinary fills: name, role, company, note, phones, emails, @nicks, links.
sets is only for an explicit correction the speaker asked for, e.g. {"position":"Founder"} or {"line":{"from":"+44 7700 900123","to":"+44 7700 900999"}}.
If the target of a correction is unclear, omit that set field and still return the other clear data.
lineFlags marks a number as WhatsApp or Telegram: [{"value":"+44…","flags":["wa"]}].
Copy only what was said. Do not invent a country code, nick, or domain. Keep a leading + if it was there.
If nothing useful was said, return empty strings and empty arrays.`;

export type ParseInput = {
  text?: string;
  image?: { mime: string; bytes: Uint8Array };
  audio?: { mime: string; bytes: Uint8Array; name: string };
  /** Set by the route. False never calls OpenAI, even when a key is present. */
  openai?: boolean;
};

/** Closed test. Empty CONTACT_READ_OWNER_IDS allows nobody. */
export function contactReadAllowed(ownerId: string, list = process.env.CONTACT_READ_OWNER_IDS): boolean {
  const id = ownerId.trim();
  if (!id) return false;
  const ids = (list ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.includes(id);
}

export type ParseResult =
  | { ok: true; draft: ContactReading }
  | { ok: false; status: number; error: string; available?: false };

export function gptConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function key() {
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

async function chat(content: unknown, allowSets: boolean): Promise<ParseResult> {
  let response: Response;
  try {
    response = await fetch(CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: allowSets ? ASK_VOICE : ASK_DATA },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    console.error("[external-contacts] read", error instanceof Error ? error.name : "fetch");
    return { ok: false, status: 502, error: "Could not read that." };
  }
  if (!response.ok) {
    console.error("[external-contacts] read", response.status);
    return { ok: false, status: 502, error: "Could not read that." };
  }
  const body = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const raw = body?.choices?.[0]?.message?.content ?? "";
  try {
    return { ok: true, draft: contactReading(JSON.parse(raw) as unknown, { allowSets }) };
  } catch {
    return { ok: false, status: 502, error: "Could not read that." };
  }
}

async function transcribe(audio: NonNullable<ParseInput["audio"]>): Promise<string | ParseResult> {
  const body = new FormData();
  const copy = audio.bytes.buffer.slice(
    audio.bytes.byteOffset,
    audio.bytes.byteOffset + audio.bytes.byteLength,
  ) as ArrayBuffer;
  body.set("model", "whisper-1");
  body.set("file", new Blob([copy], { type: audio.mime || "audio/webm" }), audio.name);
  let response: Response;
  try {
    response = await fetch(AUDIO_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body,
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    console.error("[external-contacts] hear", error instanceof Error ? error.name : "fetch");
    return { ok: false, status: 502, error: "Could not hear that." };
  }
  if (!response.ok) {
    console.error("[external-contacts] hear", response.status);
    return { ok: false, status: 502, error: "Could not hear that." };
  }
  const payload = (await response.json().catch(() => null)) as { text?: unknown } | null;
  return typeof payload?.text === "string" ? payload.text.trim() : "";
}

/** OpenAI only when the route passes openai. Text without it stays on the local reader. */
export async function parseContactInput(input: ParseInput): Promise<ParseResult> {
  const text = input.text?.trim() ?? "";
  if (!input.image && !input.audio && !text) return { ok: false, status: 400, error: "Nothing to read." };
  if (text.length > TEXT_MAX) return { ok: false, status: 400, error: "That is too long." };
  if (input.image && input.image.mime === "image/jpg") input.image.mime = "image/jpeg";
  if (input.image && !IMAGE_TYPES.has(input.image.mime)) return { ok: false, status: 400, error: "Use a photo." };
  if (input.image && input.image.bytes.byteLength > IMAGE_MAX) {
    return { ok: false, status: 400, error: "That photo is too large." };
  }
  if (input.audio && input.audio.bytes.byteLength > AUDIO_MAX) {
    return { ok: false, status: 400, error: "That recording is too large." };
  }
  if (input.openai !== true || !gptConfigured()) {
    if (input.image || input.audio) return { ok: false, status: 503, error: "Reading is not ready.", available: false };
    return { ok: true, draft: contactReading(parseContactLocal(text), { allowSets: false }) };
  }
  if (input.audio) {
    const heard = await transcribe(input.audio);
    if (typeof heard !== "string") return heard;
    if (!heard) return { ok: false, status: 422, error: "Could not hear that." };
    return chat(heard, true);
  }
  if (input.image) {
    const base64 = Buffer.from(input.image.bytes).toString("base64");
    return chat(
      [
        { type: "text", text: "Read this card or badge." },
        { type: "image_url", image_url: { url: `data:${input.image.mime};base64,${base64}` } },
      ],
      false,
    );
  }
  return chat(text, false);
}
