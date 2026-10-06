import { customAlphabet, nanoid } from "nanoid";
import { fileTypeFromBuffer } from "file-type/core";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  deleteAttachment,
  insertAttachment,
  loadAttachment,
  removeStoredObject,
  safeOriginalName,
  storagePath,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, IMAGE_BYTE_LIMIT, IMAGE_MIMES } from "@/shared/services/attachment-limits";
import { stripImageMetadata } from "@/shared/services/attachment-sanitize";
import { isEventTheme, type EventLayoutId, type EventThemeId } from "@/shared/event/themes";
import { formatEventRange } from "@/shared/event/when";

const PUBLIC_TOKEN_LENGTH = 21;
const eventCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 5);

export type CreatedEvent = {
  publicToken: string;
  code: string;
  invitePath: string;
  logoUrl: string | null;
};

export type EventListStatus = "draft" | "live" | "past";

export type ListedEvent = {
  name: string;
  publicToken: string;
  when: string | null;
  role: "owner" | "manager" | "guest";
};

/** Past follows the end. With no end, the start decides. No date is still a draft. */
export function eventListStatus(
  date: string | null,
  now = Date.now(),
  endsAt: string | null = null,
): EventListStatus {
  const mark = endsAt ?? date;
  if (!mark) return "draft";
  const time = new Date(mark).getTime();
  if (Number.isNaN(time)) return "draft";
  return time < now ? "past" : "live";
}

export type CreateEventInput = {
  ownerId: string;
  name: string;
  description: string | null;
  date: string | null;
  endsAt: string | null;
  place: string | null;
  theme: EventThemeId;
  layout: EventLayoutId;
  logo: File | null;
  isPaid: boolean;
  paymentUrl: string | null;
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

async function discardStoredLogo(attachmentId: string) {
  const row = await loadAttachment(attachmentId);
  if (!row) return;
  if (row.storage_path) await removeStoredObject(row.storage_path, row.bucket || CARD_ATTACHMENTS_BUCKET);
  await deleteAttachment(row.id, row.owner_id);
}

type MineRow = {
  name: string;
  publicToken: string;
  dateIso: string | null;
  endsIso: string | null;
  role: "owner" | "manager" | "guest";
};

function startTime(iso: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Soonest start first. Undated drafts stay at the end. */
function compareMyEvents(a: MineRow, b: MineRow): number {
  const left = startTime(a.dateIso);
  const right = startTime(b.dateIso);
  if (left === null && right === null) return a.name.localeCompare(b.name);
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function toListed(row: MineRow): ListedEvent {
  return {
    name: row.name,
    publicToken: row.publicToken,
    when: formatEventRange(row.dateIso, row.endsIso),
    role: row.role,
  };
}

function endsColumnMissing(message: string): boolean {
  return /ends_at/i.test(message) && /column|schema/i.test(message);
}

function missingTable(message: string, table: string): boolean {
  return new RegExp(table, "i").test(message) && /relation|schema|table|find/i.test(message);
}

type EventListRow = {
  id?: string;
  name: string;
  date: string | null;
  ends_at?: string | null;
  public_token: string;
  owner_id?: string;
};

/** Events I organise, plus events I joined and do not organise. Past ones stay off the list. */
export async function listMyEvents(userId: string, now = Date.now()): Promise<ListedEvent[]> {
  const admin = createAdminSupabaseClient();
  const ownedSelect = await admin.from("events").select("name, date, ends_at, public_token").eq("owner_id", userId);
  const owned = ownedSelect.error && endsColumnMissing(ownedSelect.error.message)
    ? await admin.from("events").select("name, date, public_token").eq("owner_id", userId)
    : ownedSelect;
  if (owned.error) throw new Error(owned.error.message);

  const regs = await admin.from("event_registrations").select("event_id").eq("user_id", userId);
  if (regs.error) throw new Error(regs.error.message);

  const team = await admin.from("event_team").select("event_id").eq("user_id", userId);
  if (team.error && !missingTable(team.error.message, "event_team")) throw new Error(team.error.message);
  const teamIds = new Set(
    team.error ? [] : [...new Set((team.data ?? []).map((row) => row.event_id as string))],
  );

  const ownedRows = (owned.data ?? []) as EventListRow[];
  const seen = new Set(ownedRows.map((row) => row.public_token));
  const joinedIds = [...new Set((regs.data ?? []).map((row) => row.event_id as string))];
  const extraIds = [...new Set([...teamIds, ...joinedIds])];
  let extraRows: EventListRow[] = [];
  if (extraIds.length > 0) {
    const extraSelect = await admin.from("events").select("id, name, date, ends_at, public_token, owner_id").in("id", extraIds);
    const extras = extraSelect.error && endsColumnMissing(extraSelect.error.message)
      ? await admin.from("events").select("id, name, date, public_token, owner_id").in("id", extraIds)
      : extraSelect;
    if (extras.error) throw new Error(extras.error.message);
    extraRows = (extras.data ?? []) as EventListRow[];
  }

  const asMine = (row: EventListRow, role: MineRow["role"]): MineRow => ({
    name: row.name,
    publicToken: row.public_token,
    dateIso: row.date,
    endsIso: row.ends_at ?? null,
    role,
  });
  const rows: MineRow[] = ownedRows.map((row) => asMine(row, "owner"));
  for (const row of extraRows) {
    if (!row.public_token || seen.has(row.public_token) || row.owner_id === userId) continue;
    rows.push(asMine(row, row.id && teamIds.has(row.id) ? "manager" : "guest"));
    seen.add(row.public_token);
  }
  const listed = rows.filter((row) => eventListStatus(row.dateIso, now, row.endsIso) !== "past");
  listed.sort(compareMyEvents);
  return listed.map(toListed);
}

export async function createEvent(input: CreateEventInput): Promise<CreatedEvent> {
  const logo = input.logo && input.logo.size > 0 ? await storeLogo(input.ownerId, input.logo) : null;
  const admin = createAdminSupabaseClient();

  try {
    const insertEvent = async (row: Record<string, unknown>) => {
      let payload = row;
      let inserted = await admin.from("events").insert(payload).select("public_token, code, logo_attachment_id").single();
      for (let pass = 0; pass < 2 && inserted.error; pass += 1) {
        const message = inserted.error.message;
        if (/could not find the 'layout' column/i.test(message) && "layout" in payload) {
          const { layout: _layout, ...withoutLayout } = payload;
          payload = withoutLayout;
        } else if (/could not find the 'ends_at' column/i.test(message) && "ends_at" in payload) {
          const { ends_at: _endsAt, ...withoutEnd } = payload;
          payload = withoutEnd;
        } else {
          break;
        }
        inserted = await admin.from("events").insert(payload).select("public_token, code, logo_attachment_id").single();
      }
      return inserted;
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const publicToken = nanoid(PUBLIC_TOKEN_LENGTH);
      const code = eventCode();
      const row = {
        owner_id: input.ownerId,
        name: input.name,
        logo_attachment_id: logo?.id ?? null,
        description: input.description,
        date: input.date,
        ends_at: input.endsAt,
        place: input.place,
        place_secret: false,
        theme: input.theme,
        layout: input.layout,
        public_token: publicToken,
        code,
      };
      const paidRow = {
        ...row,
        is_paid: input.isPaid,
        payment_url: input.isPaid ? input.paymentUrl : null,
        payment_mode: "manual",
      };
      let inserted = await insertEvent(paidRow);
      if (inserted.error && /could not find the '(is_paid|payment_url|payment_mode)' column/i.test(inserted.error.message)) {
        if (input.isPaid) throw new Error(inserted.error.message);
        inserted = await insertEvent(row);
      }

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

export type UpdateEventInput = {
  eventId: string;
  actorId: string;
  previousLogoId: string | null;
  name: string;
  description: string | null;
  place: string | null;
  date: string | null;
  endsAt: string | null;
  theme: EventThemeId;
  layout: EventLayoutId;
  logo: File | null;
  removeLogo: boolean;
};

/** Keeps the public token and the short code. Drops the previous pic only after the row saves. */
export async function updateEvent(input: UpdateEventInput): Promise<void> {
  const logo = input.logo && input.logo.size > 0 ? await storeLogo(input.actorId, input.logo) : null;
  const admin = createAdminSupabaseClient();
  try {
    const fields: Record<string, unknown> = {
      name: input.name,
      description: input.description,
      place: input.place,
      date: input.date,
      ends_at: input.endsAt,
      theme: input.theme,
      layout: input.layout,
    };
    if (logo) fields.logo_attachment_id = logo.id;
    else if (input.removeLogo) fields.logo_attachment_id = null;

    let payload = fields;
    let saved = await admin.from("events").update(payload).eq("id", input.eventId);
    for (let pass = 0; pass < 2 && saved.error; pass += 1) {
      const message = saved.error.message;
      if (/could not find the 'layout' column/i.test(message) && "layout" in payload) {
        const { layout: _layout, ...rest } = payload;
        payload = rest;
      } else if (/could not find the 'ends_at' column/i.test(message) && "ends_at" in payload) {
        const { ends_at: _endsAt, ...rest } = payload;
        payload = rest;
      } else {
        break;
      }
      saved = await admin.from("events").update(payload).eq("id", input.eventId);
    }
    if (saved.error) throw new Error(saved.error.message);
  } catch (error) {
    if (logo) await discardLogo(input.actorId, logo);
    throw error;
  }
  const previous = input.previousLogoId;
  if (previous && previous !== logo?.id && (logo || input.removeLogo)) await discardStoredLogo(previous);
}

/** Owner only. Registrations, team rows, and manager invites leave with the event. */
export async function deleteEvent(lookup: string, ownerId: string): Promise<void> {
  let key = lookup.trim();
  try {
    key = decodeURIComponent(key);
  } catch {
    // A broken escape is not an event.
  }
  const admin = createAdminSupabaseClient();
  const byToken = await admin
    .from("events")
    .select("id, owner_id, logo_attachment_id")
    .eq("public_token", key)
    .maybeSingle();
  if (byToken.error) throw new Error(byToken.error.message);
  let row = byToken.data as { id: string; owner_id: string; logo_attachment_id: string | null } | null;
  if (!row) {
    const byCode = await admin
      .from("events")
      .select("id, owner_id, logo_attachment_id")
      .eq("code", key)
      .maybeSingle();
    if (byCode.error) throw new Error(byCode.error.message);
    row = byCode.data as { id: string; owner_id: string; logo_attachment_id: string | null } | null;
  }
  if (!row || row.owner_id !== ownerId) throw new Error("forbidden");

  const logoId = row.logo_attachment_id;
  const removed = await admin.from("events").delete().eq("id", row.id).eq("owner_id", ownerId).select("id");
  if (removed.error) throw new Error(removed.error.message);
  if (!removed.data?.length) throw new Error("forbidden");

  if (!logoId) return;
  const attachment = await admin.from("attachments").select("owner_id, storage_path").eq("id", logoId).maybeSingle();
  if (attachment.error) throw new Error(attachment.error.message);
  const stored = attachment.data as { owner_id?: string; storage_path?: string | null } | null;
  if (stored?.storage_path) await discardLogo(stored.owner_id || ownerId, { id: logoId, path: stored.storage_path });
}
