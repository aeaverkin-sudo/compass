import { customAlphabet, nanoid } from "nanoid";
import { fileTypeFromBuffer } from "file-type/core";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  deleteAttachment,
  insertAttachment,
  removeStoredObject,
  safeOriginalName,
  storagePath,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, IMAGE_BYTE_LIMIT, IMAGE_MIMES } from "@/shared/services/attachment-limits";
import { stripImageMetadata } from "@/shared/services/attachment-sanitize";
import { isEventTheme, type EventThemeId } from "@/shared/event/themes";

const PUBLIC_TOKEN_LENGTH = 21;
const eventCode = customAlphabet("АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789", 5);

export type CreatedEvent = {
  publicToken: string;
  code: string;
  invitePath: string;
  logoUrl: string | null;
};

export type CreateEventInput = {
  ownerId: string;
  name: string;
  description: string | null;
  date: string | null;
  place: string | null;
  theme: EventThemeId;
  logo: File | null;
};

export function readEventTheme(value: string): EventThemeId {
  return isEventTheme(value) ? value : "paper";
}

/** Local date+time from the form, already an ISO string, or null. */
export function readEventDate(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function svgPayload(raw: Uint8Array): Uint8Array | null {
  const text = new TextDecoder().decode(raw).replace(/^\uFEFF/, "").trim();
  if (!/^<\?xml|^<svg[\s>]/i.test(text)) return null;
  if (/<script|javascript:|on[a-z]+\s*=/i.test(text)) return null;
  return new TextEncoder().encode(text);
}

async function storeLogo(ownerId: string, file: File): Promise<{ id: string; path: string }> {
  if (file.size <= 0 || file.size > IMAGE_BYTE_LIMIT) {
    throw new Error("logo_too_large");
  }
  const raw = new Uint8Array(await file.arrayBuffer());
  const svg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg") ? svgPayload(raw) : null;
  let bytes = svg;
  let mime = svg ? "image/svg+xml" : "";
  if (!bytes) {
    const detected = await fileTypeFromBuffer(raw);
    if (!detected || !(IMAGE_MIMES as readonly string[]).includes(detected.mime)) {
      throw new Error("logo_type");
    }
    mime = detected.mime;
    bytes = stripImageMetadata(raw, mime);
  }

  const id = crypto.randomUUID();
  const path = storagePath(ownerId, null, id);
  const admin = createAdminSupabaseClient();
  const uploaded = await admin.storage.from(CARD_ATTACHMENTS_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (uploaded.error) throw new Error("logo_store");

  try {
    await insertAttachment({
      id,
      ownerId,
      path,
      mime,
      byteSize: bytes.byteLength,
      originalName: safeOriginalName(file.name),
      status: "ready",
    });
  } catch (error) {
    await removeStoredObject(path);
    throw error;
  }
  return { id, path };
}

async function discardLogo(ownerId: string, logo: { id: string; path: string }) {
  await removeStoredObject(logo.path);
  await deleteAttachment(logo.id, ownerId);
}

export async function createEvent(input: CreateEventInput): Promise<CreatedEvent> {
  const logo = input.logo && input.logo.size > 0 ? await storeLogo(input.ownerId, input.logo) : null;
  const admin = createAdminSupabaseClient();

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const publicToken = nanoid(PUBLIC_TOKEN_LENGTH);
      const code = eventCode();
      const inserted = await admin
        .from("events")
        .insert({
          owner_id: input.ownerId,
          name: input.name,
          logo_attachment_id: logo?.id ?? null,
          description: input.description,
          date: input.date,
          place: input.place,
          place_secret: false,
          theme: input.theme,
          public_token: publicToken,
          code,
        })
        .select("public_token, code, logo_attachment_id")
        .single();

      if (!inserted.error && inserted.data) {
        const row = inserted.data;
        return {
          publicToken: row.public_token,
          code: row.code,
          invitePath: `/e/${row.public_token}`,
          logoUrl: row.logo_attachment_id ? `/f/${row.logo_attachment_id}` : null,
        };
      }
      if (inserted.error?.code !== "23505") {
        throw new Error(inserted.error?.message ?? "insert_failed");
      }
    }
    throw new Error("insert_failed");
  } catch (error) {
    if (logo) await discardLogo(input.ownerId, logo);
    throw error;
  }
}
