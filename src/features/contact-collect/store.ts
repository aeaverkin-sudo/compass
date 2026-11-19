import "server-only";

import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { foldSearch } from "@/shared/lib/search-fold";
import {
  deleteAttachment,
  loadAttachment,
  removeStoredObject,
  type AttachmentRow,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, isImageMime } from "@/shared/services/attachment-limits";
import type {
  ContactSource,
  ExternalContact,
  ExternalContactInput,
  ExternalLine,
  LineFlag,
  PushbackChannel,
} from "@/features/contact-collect/types";

/**
 * Collected contacts, apart from the deck and the connection book.
 * The service role skips RLS, so every query filters on owner_id.
 * A missing table means the SQL has not been run yet. Callers hide the feature.
 */

const COLUMNS =
  "id, display_name, photo_attachment_id, position, company, note, event_tag, source, lines, created_at, updated_at, pushback_at, pushback_channel, pushback_card_id";

const NOT_READY = "Contacts are not ready.";

export type StoreError = { ok: false; status: number; error: string; available?: false };

type DbRow = {
  id: string;
  display_name: string;
  photo_attachment_id: string | null;
  position: string;
  company: string;
  note: string;
  event_tag: string;
  source: string;
  lines: unknown;
  created_at: string;
  updated_at: string;
  pushback_at: string | null;
  pushback_channel: string | null;
  pushback_card_id: string | null;
};

type DbError = { code?: string; message?: string };

function missingTable(error: DbError) {
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = error.message ?? "";
  return /external_contacts/i.test(message) && /schema cache|does not exist|could not find/i.test(message);
}

function failed(error: DbError, fallback: string): StoreError {
  if (missingTable(error)) return { ok: false, status: 503, error: NOT_READY, available: false };
  console.error("[external-contacts]", error.message);
  return { ok: false, status: 500, error: fallback };
}

function piece(value: string) {
  const text = value.trim();
  if (!text || text.startsWith("data:")) return "";
  return text;
}

function sourceOf(value: string): ContactSource {
  if (value === "scan" || value === "voice" || value === "photo") return value;
  return "manual";
}

function channelOf(value: string | null): PushbackChannel | null {
  if (value === "email" || value === "whatsapp" || value === "telegram") return value;
  return null;
}

function readLines(value: unknown): ExternalLine[] {
  if (!Array.isArray(value)) return [];
  const lines: ExternalLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { value?: unknown; type?: unknown; flags?: unknown };
    if (typeof record.value !== "string") continue;
    const text = record.value.trim();
    if (!text) continue;
    const type = typeof record.type === "string" && record.type.trim() ? record.type.trim() : "text";
    const flags = Array.isArray(record.flags)
      ? [...new Set(record.flags.filter((flag): flag is LineFlag => flag === "wa" || flag === "tg"))]
      : [];
    lines.push(flags.length > 0 ? { value: text, type, flags } : { value: text, type });
  }
  return lines;
}

function mapRow(row: DbRow): ExternalContact {
  const lines = readLines(row.lines);
  const photoAttachmentId = row.photo_attachment_id;
  const searchText = foldSearch(
    [row.display_name, row.position, row.company, row.note, row.event_tag, ...lines.map((line) => line.value)]
      .map(piece)
      .filter(Boolean)
      .join(" "),
  );
  return {
    id: row.id,
    displayName: row.display_name,
    position: row.position ?? "",
    company: row.company ?? "",
    note: row.note ?? "",
    eventTag: row.event_tag ?? "",
    source: sourceOf(row.source),
    photoAttachmentId,
    photoUrl: photoAttachmentId ? `/f/${photoAttachmentId}` : null,
    lines,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pushbackAt: row.pushback_at,
    pushbackChannel: channelOf(row.pushback_channel),
    pushbackCardId: row.pushback_card_id,
    searchText,
  };
}

function rowValues(input: ExternalContactInput) {
  return {
    display_name: input.displayName,
    photo_attachment_id: input.photoAttachmentId,
    position: input.position,
    company: input.company,
    note: input.note,
    event_tag: input.eventTag,
    source: input.source,
    lines: input.lines,
  };
}

/** An image this person already uploaded. Anything else is refused. */
async function ownedImage(ownerId: string, photoId: string): Promise<"ok" | "missing" | "failed"> {
  try {
    const row = await loadAttachment(photoId);
    if (!row || row.owner_id !== ownerId || row.status !== "ready" || !isImageMime(row.mime)) return "missing";
    return "ok";
  } catch (error) {
    console.error("[external-contacts] photo", error instanceof Error ? error.message : error);
    return "failed";
  }
}

/** True when a portfolio, a file, an event, or another collected contact still points at the file. */
async function photoStillUsed(photoId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const checks = await Promise.all([
    admin.from("external_contacts").select("id").eq("photo_attachment_id", photoId).limit(1),
    admin.from("cards").select("id").eq("photo_attachment_id", photoId).limit(1),
    admin.from("items").select("id").eq("attachment_id", photoId).limit(1),
    admin.from("card_items").select("id").eq("attachment_id", photoId).limit(1),
    admin.from("events").select("id").eq("logo_attachment_id", photoId).limit(1),
  ]);
  for (const check of checks) {
    if (check.error) return true;
    if ((check.data ?? []).length > 0) return true;
  }
  return false;
}

/**
 * Drop a contact photo that lives in the profile folder and nowhere else.
 * A portfolio file is left alone, even if this contact was showing it.
 */
async function releasePhoto(ownerId: string, photoId: string): Promise<void> {
  let row: AttachmentRow | null;
  try {
    row = await loadAttachment(photoId);
  } catch (error) {
    console.error("[external-contacts] photo", error instanceof Error ? error.message : error);
    return;
  }
  if (!row || row.owner_id !== ownerId) return;
  if (row.bucket !== CARD_ATTACHMENTS_BUCKET) return;
  if (!row.storage_path.startsWith(`${ownerId}/profile/`)) return;
  if (await photoStillUsed(photoId)) return;
  await removeStoredObject(row.storage_path, row.bucket);
  await deleteAttachment(photoId, ownerId);
}

async function checkPhoto(ownerId: string, photoId: string | null, fallback: string): Promise<StoreError | null> {
  if (!photoId) return null;
  const photo = await ownedImage(ownerId, photoId);
  if (photo === "failed") return { ok: false, status: 500, error: fallback };
  if (photo === "missing") return { ok: false, status: 400, error: "Photo not found." };
  return null;
}

export async function listExternalContacts(
  ownerId: string,
): Promise<{ ok: true; available: true; contacts: ExternalContact[] } | { ok: true; available: false; contacts: [] } | StoreError> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin
    .from("external_contacts")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (loaded.error) {
    if (missingTable(loaded.error)) return { ok: true, available: false, contacts: [] };
    return failed(loaded.error, "Could not read contacts.");
  }
  return { ok: true, available: true, contacts: ((loaded.data ?? []) as DbRow[]).map(mapRow) };
}

export async function readExternalContact(
  ownerId: string,
  id: string,
): Promise<{ ok: true; contact: ExternalContact } | StoreError> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.from("external_contacts").select(COLUMNS).eq("owner_id", ownerId).eq("id", id).maybeSingle();
  if (loaded.error) return failed(loaded.error, "Could not read contacts.");
  if (!loaded.data) return { ok: false, status: 404, error: "Contact not found." };
  return { ok: true, contact: mapRow(loaded.data as DbRow) };
}

export async function createExternalContact(
  ownerId: string,
  input: ExternalContactInput,
): Promise<{ ok: true; contact: ExternalContact } | StoreError> {
  const photo = await checkPhoto(ownerId, input.photoAttachmentId, "Could not save the contact.");
  if (photo) return photo;
  const admin = createAdminSupabaseClient();
  const inserted = await admin
    .from("external_contacts")
    .insert({ id: crypto.randomUUID(), owner_id: ownerId, ...rowValues(input) })
    .select(COLUMNS)
    .single();
  if (inserted.error) return failed(inserted.error, "Could not save the contact.");
  return { ok: true, contact: mapRow(inserted.data as DbRow) };
}

export async function updateExternalContact(
  ownerId: string,
  id: string,
  input: ExternalContactInput,
): Promise<{ ok: true; contact: ExternalContact } | StoreError> {
  const current = await readExternalContact(ownerId, id);
  if (!current.ok) return current;
  const photo = await checkPhoto(ownerId, input.photoAttachmentId, "Could not save the contact.");
  if (photo) return photo;
  const admin = createAdminSupabaseClient();
  const updated = await admin
    .from("external_contacts")
    .update(rowValues(input))
    .eq("owner_id", ownerId)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (updated.error) return failed(updated.error, "Could not save the contact.");
  if (!updated.data) return { ok: false, status: 404, error: "Contact not found." };
  const previous = current.contact.photoAttachmentId;
  if (previous && previous !== input.photoAttachmentId) await releasePhoto(ownerId, previous);
  return { ok: true, contact: mapRow(updated.data as DbRow) };
}

export async function deleteExternalContact(ownerId: string, id: string): Promise<{ ok: true } | StoreError> {
  const current = await readExternalContact(ownerId, id);
  if (!current.ok) return current;
  const admin = createAdminSupabaseClient();
  const removed = await admin.from("external_contacts").delete().eq("owner_id", ownerId).eq("id", id);
  if (removed.error) return failed(removed.error, "Could not delete the contact.");
  if (current.contact.photoAttachmentId) await releasePhoto(ownerId, current.contact.photoAttachmentId);
  return { ok: true };
}
