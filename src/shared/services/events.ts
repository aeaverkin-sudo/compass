import { customAlphabet, nanoid } from "nanoid";
import { fileTypeFromBuffer } from "file-type/core";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { guestsByJoined } from "@/shared/event/joined-order";
import {
  deleteAttachment,
  insertAttachment,
  loadAttachment,
  removeStoredObject,
  safeOriginalName,
  storagePath,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, IMAGE_BYTE_LIMIT, IMAGE_MIMES } from "@/shared/services/attachment-limits";
import { uprightImage } from "@/shared/services/attachment-sanitize";
import { eventNameSlug, eventPublicPath, indexedEventSlug } from "@/shared/event/slug";
import { isEventTheme, type EventLayoutId, type EventThemeId } from "@/shared/event/themes";
import { formatEventRange } from "@/shared/event/when";
import { loadEventTimeZones } from "@/shared/services/event-time-zone";
import type { InviteLogoLook, InviteRow } from "@/shared/event/invite-rows";

/** Columns written before their SQL may have run. A missing one is dropped and the write retried. */
const OPTIONAL_COLUMNS = ["layout", "ends_at", "slug", "invite_rows", "logo_look", "time_zone"] as const;

function withoutMissingColumn(payload: Record<string, unknown>, message: string): Record<string, unknown> | null {
  const column = OPTIONAL_COLUMNS.find(
    (name) => name in payload && new RegExp(`could not find the '${name}' column`, "i").test(message),
  );
  if (!column) return null;
  const rest = { ...payload };
  delete rest[column];
  return rest;
}

function cardFields(input: { inviteRows?: InviteRow[]; logoLook?: InviteLogoLook | null; timeZone?: string | null }) {
  return {
    ...(input.inviteRows ? { invite_rows: input.inviteRows } : {}),
    ...(input.logoLook !== undefined ? { logo_look: input.logoLook } : {}),
    ...(input.timeZone ? { time_zone: input.timeZone } : {}),
  };
}

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
  status: EventListStatus;
  /** The start, for one list in time order with the invitations. */
  startsAt: string | null;
  /** A guest row: where it is and the card worn as the pass. */
  place?: string | null;
  pass?: { cardName: string; photoUrl: string | null } | null;
  /** A guest row: when the guest confirmed going. */
  joinedAt?: string | null;
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

/** Past at this moment. */
export function eventHasEnded(date: string | null, endsAt: string | null): boolean {
  return eventListStatus(date, Date.now(), endsAt) === "past";
}

const DOOR_OPENS_BEFORE_MS = 2 * 60 * 60 * 1000;

/** From two hours before the start until the end. */
export function eventDoorIsOpen(date: string | null, endsAt: string | null): boolean {
  const start = date ? Date.parse(date) : NaN;
  return Number.isFinite(start) && Date.now() >= start - DOOR_OPENS_BEFORE_MS && !eventHasEnded(date, endsAt);
}

export type CreateEventInput = {
  ownerId: string;
  name: string;
  description: string | null;
  date: string | null;
  endsAt: string | null;
  timeZone?: string | null;
  place: string | null;
  theme: EventThemeId;
  layout: EventLayoutId;
  inviteRows?: InviteRow[];
  logoLook?: InviteLogoLook | null;
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
    bytes = await uprightImage(raw, mime);
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
  timeZone?: string;
  role: "owner" | "manager" | "guest";
  place?: string | null;
  pass?: { cardName: string; photoUrl: string | null } | null;
  joinedAt?: string | null;
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

/** Most recently finished first. */
function comparePastEvents(a: MineRow, b: MineRow): number {
  const left = startTime(a.endsIso ?? a.dateIso);
  const right = startTime(b.endsIso ?? b.dateIso);
  if (left === null && right === null) return a.name.localeCompare(b.name);
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function toListed(row: MineRow, now: number): ListedEvent {
  return {
    name: row.name,
    publicToken: row.publicToken,
    when: formatEventRange(row.dateIso, row.endsIso, row.timeZone),
    role: row.role,
    status: eventListStatus(row.dateIso, now, row.endsIso),
    startsAt: row.dateIso,
    ...(row.role === "guest" ? { place: row.place ?? null, pass: row.pass ?? null, joinedAt: row.joinedAt ?? null } : {}),
  };
}

/** The card each registration wears, by event id. */
async function passCards(regs: { event_id: string; card_id: string | null }[]): Promise<Map<string, MineRow["pass"]>> {
  const out = new Map<string, MineRow["pass"]>();
  const ids = [...new Set(regs.map((row) => row.card_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return out;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("cards").select("id, display_name, photo_attachment_id").in("id", ids);
  if (error) return out;
  const cards = new Map(
    ((data ?? []) as { id: string; display_name: string | null; photo_attachment_id: string | null }[]).map((card) => [
      card.id,
      {
        cardName: (card.display_name ?? "").replace(/\s+/g, " ").trim() || "Untitled",
        photoUrl: card.photo_attachment_id ? `/f/${card.photo_attachment_id}` : null,
      },
    ]),
  );
  for (const row of regs) if (row.card_id && cards.has(row.card_id)) out.set(row.event_id, cards.get(row.card_id));
  return out;
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
  place?: string | null;
  place_secret?: boolean | null;
  public_token: string;
  owner_id?: string;
};

/** Events I organise, plus events I joined and do not organise. A past event stays for the owner and managers. */
export async function listMyEvents(userId: string, now = Date.now()): Promise<ListedEvent[]> {
  const admin = createAdminSupabaseClient();
  const ownedSelect = await admin.from("events").select("id, name, date, ends_at, public_token").eq("owner_id", userId);
  const owned = ownedSelect.error && endsColumnMissing(ownedSelect.error.message)
    ? await admin.from("events").select("id, name, date, public_token").eq("owner_id", userId)
    : ownedSelect;
  if (owned.error) throw new Error(owned.error.message);

  const regs = await admin.from("event_registrations").select("event_id, card_id, created_at").eq("user_id", userId);
  if (regs.error) throw new Error(regs.error.message);
  const passes = await passCards((regs.data ?? []) as { event_id: string; card_id: string | null }[]);
  const joinedAt = new Map(
    ((regs.data ?? []) as { event_id: string; created_at: string | null }[]).map((row) => [row.event_id, row.created_at]),
  );

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
    const extraSelect = await admin
      .from("events")
      .select("id, name, date, ends_at, place, place_secret, public_token, owner_id")
      .in("id", extraIds);
    const extras = extraSelect.error && endsColumnMissing(extraSelect.error.message)
      ? await admin.from("events").select("id, name, date, place, place_secret, public_token, owner_id").in("id", extraIds)
      : extraSelect;
    if (extras.error) throw new Error(extras.error.message);
    extraRows = (extras.data ?? []) as EventListRow[];
  }

  const zones = await loadEventTimeZones([...ownedRows, ...extraRows].map((row) => row.id ?? ""));
  const asMine = (row: EventListRow, role: MineRow["role"]): MineRow => ({
    name: row.name,
    publicToken: row.public_token,
    dateIso: row.date,
    endsIso: row.ends_at ?? null,
    timeZone: row.id ? zones.get(row.id) : undefined,
    role,
    place: row.place_secret ? null : row.place?.trim() || null,
    pass: row.id ? passes.get(row.id) ?? null : null,
    joinedAt: row.id ? joinedAt.get(row.id) ?? null : null,
  });
  const rows: MineRow[] = ownedRows.map((row) => asMine(row, "owner"));
  for (const row of extraRows) {
    if (!row.public_token || seen.has(row.public_token) || row.owner_id === userId) continue;
    rows.push(asMine(row, row.id && teamIds.has(row.id) ? "manager" : "guest"));
    seen.add(row.public_token);
  }
  const kept = rows.filter(
    (row) => row.role !== "guest" || eventListStatus(row.dateIso, now, row.endsIso) !== "past",
  );
  const current = kept.filter((row) => eventListStatus(row.dateIso, now, row.endsIso) !== "past");
  const past = kept.filter((row) => eventListStatus(row.dateIso, now, row.endsIso) === "past");
  current.sort(compareMyEvents);
  past.sort(comparePastEvents);
  return [...guestsByJoined(current), ...past].map((row) => toListed(row, now));
}

async function nextEventSlug(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  name: string,
): Promise<string | null> {
  const stem = eventNameSlug(name);
  if (!stem) return null;
  for (let index = 1; index <= 500; index += 1) {
    const candidate = indexedEventSlug(stem, index);
    const found = await admin.from("events").select("id").eq("slug", candidate).maybeSingle();
    if (found.error) {
      if (/slug/i.test(found.error.message) && /column|schema/i.test(found.error.message)) return null;
      throw new Error(found.error.message);
    }
    if (!found.data) return candidate;
  }
  return null;
}

export async function createEvent(input: CreateEventInput): Promise<CreatedEvent> {
  const logo = input.logo && input.logo.size > 0 ? await storeLogo(input.ownerId, input.logo) : null;
  const admin = createAdminSupabaseClient();

  try {
    const insertEvent = async (row: Record<string, unknown>) => {
      let payload = row;
      const write = (body: Record<string, unknown>) =>
        "slug" in body
          ? admin.from("events").insert(body).select("public_token, code, logo_attachment_id, slug").single()
          : admin.from("events").insert(body).select("public_token, code, logo_attachment_id").single();
      let inserted = await write(payload);
      for (let pass = 0; pass < OPTIONAL_COLUMNS.length && inserted.error; pass += 1) {
        const next = withoutMissingColumn(payload, inserted.error.message);
        if (!next) break;
        payload = next;
        inserted = await write(payload);
      }
      return inserted;
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const publicToken = nanoid(PUBLIC_TOKEN_LENGTH);
      const code = eventCode();
      const slug = await nextEventSlug(admin, input.name);
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
        ...cardFields(input),
        public_token: publicToken,
        code,
        ...(slug ? { slug } : {}),
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
        const saved = inserted.data as {
          public_token: string;
          code: string;
          logo_attachment_id: string | null;
          slug?: string | null;
        };
        return {
          publicToken: saved.public_token,
          code: saved.code,
          invitePath: eventPublicPath(saved.slug?.trim() || saved.code?.trim() || saved.public_token),
          logoUrl: saved.logo_attachment_id ? `/f/${saved.logo_attachment_id}` : null,
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
  timeZone?: string | null;
  theme: EventThemeId;
  layout: EventLayoutId;
  inviteRows?: InviteRow[];
  logoLook?: InviteLogoLook | null;
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
      ...cardFields(input),
    };
    if (logo) fields.logo_attachment_id = logo.id;
    else if (input.removeLogo) fields.logo_attachment_id = null;

    let payload = fields;
    let saved = await admin.from("events").update(payload).eq("id", input.eventId);
    for (let pass = 0; pass < OPTIONAL_COLUMNS.length && saved.error; pass += 1) {
      const next = withoutMissingColumn(payload, saved.error.message);
      if (!next) break;
      payload = next;
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
