import "server-only";

import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { foldSearch } from "@/shared/lib/search-fold";
import {
  deleteAttachment,
  loadAttachment,
  removeStoredObject,
  safeOriginalName,
  type AttachmentRow,
} from "@/shared/services/attachment-api";
import {
  AUDIO_MIMES,
  CARD_ATTACHMENTS_BUCKET,
  CONTACT_FILES_BUCKET,
  isImageMime,
  isVideoMime,
} from "@/shared/services/attachment-limits";
import { CONTACT_FILE_LIMIT, contactFilePath } from "@/features/contact-collect/contact-files";
import {
  missingHeaderColumn,
  missingMoreColumn,
  missingTable,
  readColumnLadder,
  type ColumnSet,
  type SchemaClock,
} from "@/features/contact-collect/store-columns";
import type {
  ContactFileRef,
  ContactLink,
  ContactSource,
  ExternalContact,
  ExternalContactInput,
  ExternalLine,
  HeaderField,
  LineFlag,
  PushbackChannel,
} from "@/features/contact-collect/types";

/**
 * Collected contacts, apart from the deck and the connection book.
 * The service role skips RLS, so every query filters on owner_id.
 * A missing table means the SQL has not been run yet. Callers hide the feature.
 */

const COLUMNS_BASE =
  "id, display_name, photo_attachment_id, position, company, note, event_tag, source, lines, created_at, updated_at, pushback_at, pushback_channel, pushback_card_id";
const COLUMNS = `${COLUMNS_BASE}, header_field`;
const COLUMNS_MORE = `${COLUMNS}, web, social, about, files`;
const COLUMNS_MORE_BASE = `${COLUMNS_BASE}, web, social, about, files`;

/** An insert that wrote About must return it. An empty About stays on the base columns. */
export function insertReturning(wroteAbout: boolean, withHeader: boolean): string {
  const columns = withHeader ? COLUMNS : COLUMNS_BASE;
  return wroteAbout ? `${columns}, about` : columns;
}

/** The retry after a missing header_field must not ask for that column again. */
export function updateReturning(widened: boolean, withHeader: boolean): string {
  if (!widened) return withHeader ? COLUMNS : COLUMNS_BASE;
  return withHeader ? COLUMNS_MORE : COLUMNS_MORE_BASE;
}

/** The About text returned by a save, and the search text that must contain it. */
export function savedAboutFields(row: {
  about?: string | null;
  note?: string | null;
  display_name?: string | null;
}): { about: string; searchText: string } {
  const about = row.about ?? "";
  const searchText = foldSearch([row.display_name ?? "", row.note ?? "", about].filter(Boolean).join(" "));
  return { about, searchText };
}

const NOT_READY = "Contacts are not ready.";

export type StoreError = { ok: false; status: number; error: string; available?: false };

type DbRow = {
  id: string;
  display_name: string;
  photo_attachment_id: string | null;
  position: string;
  company: string;
  header_field?: string | null;
  note: string;
  event_tag: string;
  source: string;
  lines: unknown;
  created_at: string;
  updated_at: string;
  pushback_at: string | null;
  pushback_channel: string | null;
  pushback_card_id: string | null;
  web?: unknown;
  social?: unknown;
  about?: string | null;
  files?: unknown;
};

type DbError = { code?: string; message?: string };

function headerOf(value: string | null | undefined, position: string, company: string): HeaderField | null {
  if (value === "position" && position.trim()) return "position";
  if (value === "company" && company.trim()) return "company";
  return null;
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

function readLinks(value: unknown): ContactLink[] {
  if (!Array.isArray(value)) return [];
  const links: ContactLink[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { value?: unknown; type?: unknown };
    if (typeof record.value !== "string") continue;
    const text = record.value.trim();
    if (!text) continue;
    const type = typeof record.type === "string" && record.type.trim() ? record.type.trim() : "link";
    links.push({ value: text, type });
  }
  return links;
}

function readFiles(value: unknown): ContactFileRef[] {
  if (!Array.isArray(value)) return [];
  const files: ContactFileRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { id?: unknown; name?: unknown; type?: unknown };
    if (typeof record.id !== "string" || !record.id) continue;
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "File";
    const type = typeof record.type === "string" && record.type.trim() ? record.type.trim() : "file";
    files.push({ id: record.id, name, type });
  }
  return files;
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
  const eventTag = row.event_tag ?? "";
  const eventBare = eventTag.replace(/^[#/]+/, "");
  const savedAbout = savedAboutFields(row);
  const searchText = foldSearch(
    [
      row.display_name,
      row.position,
      row.company,
      row.note,
      eventTag,
      eventBare,
      savedAbout.about,
      ...lines.map((line) => line.value),
      ...readLinks(row.web).map((link) => link.value),
      ...readLinks(row.social).map((link) => link.value),
      ...readFiles(row.files).map((file) => file.name),
    ]
      .map(piece)
      .filter(Boolean)
      .join(" "),
  );
  const position = row.position ?? "";
  const company = row.company ?? "";
  return {
    id: row.id,
    displayName: row.display_name,
    position,
    company,
    headerField: headerOf(row.header_field, position, company),
    note: row.note ?? "",
    eventTag: row.event_tag ?? "",
    source: sourceOf(row.source),
    photoAttachmentId,
    photoUrl: photoAttachmentId ? `/f/${photoAttachmentId}` : null,
    lines,
    web: readLinks(row.web),
    social: readLinks(row.social),
    about: savedAbout.about,
    files: readFiles(row.files),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pushbackAt: row.pushback_at,
    pushbackChannel: channelOf(row.pushback_channel),
    pushbackCardId: row.pushback_card_id,
    searchText,
  };
}

function rowValues(input: ExternalContactInput, withHeader: boolean) {
  const base = {
    display_name: input.displayName,
    photo_attachment_id: input.photoAttachmentId,
    position: input.position,
    company: input.company,
    note: input.note,
    event_tag: input.eventTag,
    source: input.source,
    lines: input.lines,
  };
  if (!withHeader) return base;
  return { ...base, header_field: headerOf(input.headerField, input.position, input.company) };
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

const COLUMN_SQL: Record<ColumnSet, string> = {
  more: COLUMNS_MORE,
  moreBase: COLUMNS_MORE_BASE,
  header: COLUMNS,
  base: COLUMNS_BASE,
};

/** Wide-select time, plus the set that last worked. Base reads must not move the time. */
let schemaClock: SchemaClock = { known: "more", fullCheckAt: 0 };
const COLUMN_HOLD_MS = 5 * 60 * 1000;

async function loadExternal(ownerId: string, id?: string) {
  const admin = createAdminSupabaseClient();
  const run = (set: ColumnSet) => {
    const query = admin.from("external_contacts").select(COLUMN_SQL[set]).eq("owner_id", ownerId);
    if (!id) return query.order("created_at", { ascending: true });
    return query.eq("id", id).maybeSingle();
  };
  const outcome = await readColumnLadder(schemaClock, Date.now(), COLUMN_HOLD_MS, async (set) => {
    const result = await run(set);
    return {
      error: result.error ? { code: result.error.code, message: result.error.message } : null,
      data: result.data,
    };
  });
  schemaClock = outcome.clock;
  return outcome.result;
}

/** Upload may target a contact only after this owner already saved it. */
export async function ownsExternalContact(
  ownerId: string,
  id: string,
): Promise<"yes" | "no" | "unavailable" | "failed"> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.from("external_contacts").select("id").eq("owner_id", ownerId).eq("id", id).maybeSingle();
  if (loaded.error) {
    if (missingTable(loaded.error)) return "unavailable";
    console.error("[external-contacts] owner", loaded.error.message);
    return "failed";
  }
  return loaded.data ? "yes" : "no";
}

export async function listExternalContacts(
  ownerId: string,
): Promise<{ ok: true; available: true; contacts: ExternalContact[] } | { ok: true; available: false; contacts: [] } | StoreError> {
  const loaded = await loadExternal(ownerId);
  if (loaded.error) {
    if (missingTable(loaded.error)) return { ok: true, available: false, contacts: [] };
    return failed(loaded.error, "Could not read contacts.");
  }
  return { ok: true, available: true, contacts: ((loaded.data ?? []) as unknown as DbRow[]).map(mapRow) };
}

export async function readExternalContact(
  ownerId: string,
  id: string,
): Promise<{ ok: true; contact: ExternalContact } | StoreError> {
  const loaded = await loadExternal(ownerId, id);
  if (loaded.error) return failed(loaded.error, "Could not read contacts.");
  if (!loaded.data) return { ok: false, status: 404, error: "Contact not found." };
  return { ok: true, contact: mapRow(loaded.data as unknown as DbRow) };
}

export async function createExternalContact(
  ownerId: string,
  input: ExternalContactInput,
): Promise<{ ok: true; contact: ExternalContact } | StoreError> {
  const photo = await checkPhoto(ownerId, input.photoAttachmentId, "Could not save the contact.");
  if (photo) return photo;
  const admin = createAdminSupabaseClient();
  const id = crypto.randomUUID();
  const aboutCols = input.about?.trim() ? { about: input.about } : {};
  const wroteAbout = Boolean(aboutCols.about);
  const withHeader = await admin
    .from("external_contacts")
    .insert({ id, owner_id: ownerId, ...rowValues(input, true), ...aboutCols })
    .select(insertReturning(wroteAbout, true))
    .single();
  const inserted =
    withHeader.error && missingHeaderColumn(withHeader.error) && !missingMoreColumn(withHeader.error)
      ? await admin
          .from("external_contacts")
          .insert({ id, owner_id: ownerId, ...rowValues(input, false), ...aboutCols })
          .select(insertReturning(wroteAbout, false))
          .single()
      : withHeader;
  if (inserted.error) {
    if (aboutCols.about && (missingMoreColumn(inserted.error) || missingHeaderColumn(inserted.error))) {
      return { ok: false, status: 503, error: "Could not save the extra sections." };
    }
    return failed(inserted.error, "Could not save the contact.");
  }
  return { ok: true, contact: mapRow(inserted.data as unknown as DbRow) };
}

function fileTypeOf(mime: string): string | null {
  if (mime === "application/pdf") return "pdf";
  if (isImageMime(mime)) return "photo";
  if (isVideoMime(mime)) return "video";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "document";
  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "presentation";
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "spreadsheet";
  if ((AUDIO_MIMES as readonly string[]).includes(mime)) return "audio";
  return null;
}

/** A ready file uploaded for this contact, in the contact bucket. */
async function boundFiles(
  ownerId: string,
  contactId: string,
  files: ContactFileRef[],
): Promise<ContactFileRef[] | StoreError> {
  if (files.length > CONTACT_FILE_LIMIT) return { ok: false, status: 400, error: "Too many files." };
  if (files.length === 0) return [];
  const admin = createAdminSupabaseClient();
  const loaded = await admin
    .from("attachments")
    .select("id, owner_id, bucket, storage_path, mime, original_name, status")
    .in("id", files.map((file) => file.id));
  if (loaded.error) return { ok: false, status: 500, error: "Could not save the contact." };
  const rows = new Map(
    (loaded.data ?? []).map((row) => [row.id as string, row] as const),
  );
  const ready: ContactFileRef[] = [];
  for (const file of files) {
    const row = rows.get(file.id);
    const mime = typeof row?.mime === "string" ? row.mime : "";
    const type = fileTypeOf(mime);
    if (
      !row ||
      row.owner_id !== ownerId ||
      row.bucket !== CONTACT_FILES_BUCKET ||
      row.status !== "ready" ||
      row.storage_path !== contactFilePath(ownerId, contactId, file.id) ||
      !type
    ) {
      return { ok: false, status: 400, error: "File not found." };
    }
    ready.push({ id: file.id, name: safeOriginalName(row.original_name) || "File", type });
  }
  return ready;
}

async function fileStillLinked(attachmentId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const hit = await admin.from("external_contacts").select("id").contains("files", JSON.stringify([{ id: attachmentId }])).limit(1);
  if (hit.error) {
    if (missingMoreColumn(hit.error)) return false;
    console.error("[external-contacts] file", hit.error.message);
    return true;
  }
  return (hit.data ?? []).length > 0;
}

async function releaseContactFile(ownerId: string, attachmentId: string): Promise<void> {
  if (await fileStillLinked(attachmentId)) return;
  let row: AttachmentRow | null;
  try {
    row = await loadAttachment(attachmentId);
  } catch (error) {
    console.error("[external-contacts] file", error instanceof Error ? error.message : error);
    return;
  }
  if (!row || row.owner_id !== ownerId || row.bucket !== CONTACT_FILES_BUCKET) return;
  await removeStoredObject(row.storage_path, row.bucket);
  await deleteAttachment(attachmentId, ownerId);
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
  const wantsSections = input.web !== undefined || input.social !== undefined || input.files !== undefined;
  if (wantsSections && (input.web === undefined || input.social === undefined || input.files === undefined)) {
    return { ok: false, status: 400, error: "Expected the extra sections." };
  }
  const wantsAbout = input.about !== undefined;
  let files: ContactFileRef[] | null = null;
  if (wantsSections) {
    const bound = await boundFiles(ownerId, id, input.files ?? []);
    if (!Array.isArray(bound)) return bound;
    files = bound;
  }
  const admin = createAdminSupabaseClient();
  const extras = {
    ...(wantsAbout ? { about: input.about } : {}),
    ...(wantsSections ? { web: input.web, social: input.social, files } : {}),
  };
  const updated = wantsAbout || wantsSections
    ? await (async () => {
        const withHeader = await admin
          .from("external_contacts")
          .update({ ...rowValues(input, true), ...extras })
          .eq("owner_id", ownerId)
          .eq("id", id)
          .select(updateReturning(true, true))
          .maybeSingle();
        if (withHeader.error && missingHeaderColumn(withHeader.error) && !missingMoreColumn(withHeader.error)) {
          return admin
            .from("external_contacts")
            .update({ ...rowValues(input, false), ...extras })
            .eq("owner_id", ownerId)
            .eq("id", id)
            .select(updateReturning(true, false))
            .maybeSingle();
        }
        return withHeader;
      })()
    : await (async () => {
        const withHeader = await admin
          .from("external_contacts")
          .update(rowValues(input, true))
          .eq("owner_id", ownerId)
          .eq("id", id)
          .select(updateReturning(false, true))
          .maybeSingle();
        if (withHeader.error && missingHeaderColumn(withHeader.error)) {
          return admin
            .from("external_contacts")
            .update(rowValues(input, false))
            .eq("owner_id", ownerId)
            .eq("id", id)
            .select(updateReturning(false, false))
            .maybeSingle();
        }
        return withHeader;
      })();
  if (updated.error) {
    if ((wantsAbout || wantsSections) && (missingMoreColumn(updated.error) || missingHeaderColumn(updated.error))) {
      return { ok: false, status: 503, error: "Could not save the extra sections." };
    }
    return failed(updated.error, "Could not save the contact.");
  }
  if (!updated.data) return { ok: false, status: 404, error: "Contact not found." };
  const previous = current.contact.photoAttachmentId;
  if (previous && previous !== input.photoAttachmentId) await releasePhoto(ownerId, previous);
  if (files) {
    const nextIds = new Set(files.map((file) => file.id));
    for (const file of current.contact.files) {
      if (!nextIds.has(file.id)) await releaseContactFile(ownerId, file.id);
    }
  }
  return { ok: true, contact: mapRow(updated.data as unknown as DbRow) };
}

/** The owner's own portfolio, for the link in a pushback. Not a connection. */
export async function readOwnedPortfolio(
  ownerId: string,
  cardId: string,
): Promise<{ ok: true; name: string; publicToken: string; handle: string | null } | StoreError> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin
    .from("cards")
    .select("display_name, public_token, handle")
    .eq("id", cardId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (loaded.error) return failed(loaded.error, "Could not read the portfolio.");
  const row = loaded.data as { display_name?: unknown; public_token?: unknown; handle?: unknown } | null;
  const name = typeof row?.display_name === "string" ? row.display_name.trim() : "";
  const publicToken = typeof row?.public_token === "string" ? row.public_token.trim() : "";
  if (!name || !publicToken) return { ok: false, status: 404, error: "Portfolio not found." };
  const handle = typeof row?.handle === "string" ? row.handle.trim() : "";
  return { ok: true, name, publicToken, handle: handle || null };
}

/** One pushback. A second one loses to the row that already has pushback_at. */
export async function markPushback(
  ownerId: string,
  id: string,
  channel: PushbackChannel,
  cardId: string,
): Promise<{ ok: true } | StoreError> {
  const current = await readExternalContact(ownerId, id);
  if (!current.ok) return current;
  if (current.contact.pushbackAt) return { ok: false, status: 409, error: "Already sent." };
  const admin = createAdminSupabaseClient();
  const stamped = await admin
    .from("external_contacts")
    .update({
      pushback_at: new Date().toISOString(),
      pushback_channel: channel,
      pushback_card_id: cardId,
    })
    .eq("owner_id", ownerId)
    .eq("id", id)
    .is("pushback_at", null)
    .select("id")
    .maybeSingle();
  if (stamped.error) return failed(stamped.error, "Could not send.");
  if (!stamped.data) return { ok: false, status: 409, error: "Already sent." };
  return { ok: true };
}

/** Drop a stamp when the email itself failed, so Swap stays available. */
export async function clearPushback(
  ownerId: string,
  id: string,
  channel: PushbackChannel,
  cardId: string,
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const cleared = await admin
    .from("external_contacts")
    .update({ pushback_at: null, pushback_channel: null, pushback_card_id: null })
    .eq("owner_id", ownerId)
    .eq("id", id)
    .eq("pushback_channel", channel)
    .eq("pushback_card_id", cardId);
  if (cleared.error) console.error("[external-contacts]", cleared.error.message);
}

export async function deleteExternalContact(ownerId: string, id: string): Promise<{ ok: true } | StoreError> {
  const current = await readExternalContact(ownerId, id);
  if (!current.ok) return current;
  const admin = createAdminSupabaseClient();
  const removed = await admin.from("external_contacts").delete().eq("owner_id", ownerId).eq("id", id);
  if (removed.error) return failed(removed.error, "Could not delete the contact.");
  if (current.contact.photoAttachmentId) await releasePhoto(ownerId, current.contact.photoAttachmentId);
  for (const file of current.contact.files) await releaseContactFile(ownerId, file.id);
  return { ok: true };
}
