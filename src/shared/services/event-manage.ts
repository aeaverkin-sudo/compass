import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { CARD_ATTACHMENTS_BUCKET, SIGNED_READ_SECONDS } from "@/shared/services/attachment-limits";
import { loadEventInvite } from "@/shared/services/event-invite";
import { eventListStatus, type EventListStatus } from "@/shared/services/events";

const REG_TOKEN = /^[A-Za-z0-9_-]{21}$/;
const MANAGER_CAP = 5;

export const EVENT_PERMISSIONS = ["checkin", "guests", "payments", "analytics", "edit", "team"] as const;
export type EventPermission = (typeof EVENT_PERMISSIONS)[number];

export const MANAGE_SECTIONS = ["event", "invite", "guests", "payment", "managers", "checkin", "analytics", "edit"] as const;
export type ManageSection = (typeof MANAGE_SECTIONS)[number];

const SECTION_PERMISSION: Partial<Record<ManageSection, EventPermission>> = {
  guests: "guests",
  payment: "payments",
  managers: "team",
  checkin: "checkin",
  analytics: "analytics",
  edit: "edit",
};

export type EventPermissions = Record<EventPermission, boolean>;

export type ManageEvent = {
  id: string;
  name: string;
  publicToken: string;
  code: string;
  date: string | null;
  endsAt: string | null;
  place: string | null;
  placeSecret: boolean;
  isPaid: boolean;
  status: EventListStatus;
  role: "owner" | "manager";
  permissions: EventPermissions;
  registered: number;
  paid: number;
  checkedIn: number;
  managers: number;
};

export type ManageLoad = { kind: "missing" } | { kind: "forbidden" } | { kind: "ok"; event: ManageEvent };

export type EventGuest = {
  id: string;
  name: string;
  photoUrl: string | null;
  paid: boolean;
  checkedIn: boolean;
  connected: boolean;
};

export type EventGuestList = {
  guests: EventGuest[];
  registered: number;
  paid: number;
  checkedIn: number;
};

export type CheckInOutcome =
  | { ok: true; status: "ok"; name: string; at: string }
  | { ok: true; status: "already"; name: string; at: string }
  | { ok: true; status: "unpaid"; name: string }
  | { ok: false; status: number; error: string };

export type CheckInDesk = {
  registered: number;
  checkedIn: number;
  last: { name: string; at: string; byViewer: boolean } | null;
  roster: { name: string; regToken: string }[];
};

type PermissionBag = Record<string, unknown>;

function emptyPermissions(): EventPermissions {
  return { checkin: false, guests: false, payments: false, analytics: false, edit: false, team: false };
}

function allPermissions(): EventPermissions {
  return { checkin: true, guests: true, payments: true, analytics: true, edit: true, team: true };
}

function readPermissions(raw: unknown): EventPermissions {
  const source = raw && typeof raw === "object" ? (raw as PermissionBag) : {};
  const permissions = emptyPermissions();
  for (const key of EVENT_PERMISSIONS) permissions[key] = source[key] === true;
  return permissions;
}

function anyPermission(permissions: EventPermissions): boolean {
  return EVENT_PERMISSIONS.some((key) => permissions[key]);
}

/** Owner sees every section. A manager sees the sections their flags allow. */
export function visibleSections(role: "owner" | "manager", permissions: EventPermissions): ManageSection[] {
  if (role === "owner") return [...MANAGE_SECTIONS];
  return MANAGE_SECTIONS.filter((section) => {
    const permission = SECTION_PERMISSION[section];
    return permission ? permissions[permission] : false;
  });
}

export function managerCap(): number {
  return MANAGER_CAP;
}

function missingColumn(message: string, column: string): boolean {
  return new RegExp(column, "i").test(message) && /column|schema/i.test(message);
}

function missingTable(message: string, table: string): boolean {
  return new RegExp(table, "i").test(message) && /relation|schema|table|find/i.test(message);
}

function guestName(value: string | null | undefined): string {
  const name = (value ?? "").trim();
  return name || "Untitled";
}

async function readOwnerPaid(eventId: string): Promise<{ ownerId: string; isPaid: boolean } | null> {
  const admin = createAdminSupabaseClient();
  const withPaid = await admin.from("events").select("owner_id, is_paid").eq("id", eventId).maybeSingle();
  if (withPaid.error && missingColumn(withPaid.error.message, "is_paid")) {
    const ownerOnly = await admin.from("events").select("owner_id").eq("id", eventId).maybeSingle();
    if (ownerOnly.error || !ownerOnly.data) return null;
    return { ownerId: String((ownerOnly.data as { owner_id: string }).owner_id), isPaid: false };
  }
  if (withPaid.error || !withPaid.data) return null;
  const row = withPaid.data as { owner_id: string; is_paid?: boolean | null };
  return { ownerId: String(row.owner_id), isPaid: row.is_paid === true };
}

async function readMembership(eventId: string, userId: string): Promise<EventPermissions | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("event_team")
    .select("permissions")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (missingTable(error.message, "event_team")) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return readPermissions((data as { permissions?: unknown }).permissions);
}

async function countManagers(eventId: string): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("event_team")
    .select("user_id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) {
    if (missingTable(error.message, "event_team")) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

type CountRow = { paid_status?: string | null; checked_in_at?: string | null };

async function countGuests(eventId: string): Promise<{ registered: number; paid: number; checkedIn: number }> {
  const admin = createAdminSupabaseClient();
  const withPaid = await admin.from("event_registrations").select("paid_status, checked_in_at").eq("event_id", eventId);
  const rows = withPaid.error && missingColumn(withPaid.error.message, "paid_status")
    ? await admin.from("event_registrations").select("checked_in_at").eq("event_id", eventId)
    : withPaid;
  if (rows.error) throw new Error(rows.error.message);
  const list = (rows.data ?? []) as CountRow[];
  return {
    registered: list.length,
    paid: list.filter((row) => row.paid_status === "paid").length,
    checkedIn: list.filter((row) => Boolean(row.checked_in_at)).length,
  };
}

/**
 * The cabinet. The owner passes every section. A manager needs the asked
 * right, or any right when the overview does not name one.
 */
export async function loadManageEvent(
  lookup: string,
  userId: string,
  permission?: EventPermission,
): Promise<ManageLoad> {
  const invite = await loadEventInvite(lookup);
  if (!invite) return { kind: "missing" };
  const owner = await readOwnerPaid(invite.id);
  if (!owner) return { kind: "missing" };

  const isOwner = owner.ownerId === userId;
  const permissions = isOwner ? allPermissions() : await readMembership(invite.id, userId);
  if (!permissions) return { kind: "forbidden" };
  if (permission ? !permissions[permission] : !anyPermission(permissions)) return { kind: "forbidden" };

  const [counts, managers] = await Promise.all([countGuests(invite.id), countManagers(invite.id)]);
  return {
    kind: "ok",
    event: {
      id: invite.id,
      name: invite.name,
      publicToken: invite.publicToken,
      code: invite.code,
      date: invite.date,
      endsAt: invite.endsAt,
      place: invite.place,
      placeSecret: invite.placeSecret,
      isPaid: owner.isPaid,
      status: eventListStatus(invite.date, Date.now(), invite.endsAt),
      role: isOwner ? "owner" : "manager",
      permissions,
      registered: counts.registered,
      paid: counts.paid,
      checkedIn: counts.checkedIn,
      managers,
    },
  };
}

type GuestRow = {
  id: string;
  user_id: string;
  card_id: string;
  paid_status?: string | null;
  checked_in_at?: string | null;
};

async function registrationRows(eventId: string): Promise<GuestRow[]> {
  const admin = createAdminSupabaseClient();
  const withPaid = await admin
    .from("event_registrations")
    .select("id, user_id, card_id, paid_status, checked_in_at")
    .eq("event_id", eventId);
  const rows = withPaid.error && missingColumn(withPaid.error.message, "paid_status")
    ? await admin.from("event_registrations").select("id, user_id, card_id, checked_in_at").eq("event_id", eventId)
    : withPaid;
  if (rows.error) throw new Error(rows.error.message);
  return (rows.data ?? []) as GuestRow[];
}

async function photoUrls(ids: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (ids.length === 0) return urls;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("attachments").select("id, storage_path, bucket, status").in("id", ids);
  if (error) return urls;
  await Promise.all(
    (data ?? []).map(async (row) => {
      const file = row as { id: string; storage_path: string | null; bucket: string | null; status: string | null };
      if (file.status !== "ready" || !file.storage_path) return;
      const signed = await admin.storage
        .from(file.bucket || CARD_ATTACHMENTS_BUCKET)
        .createSignedUrl(file.storage_path, SIGNED_READ_SECONDS);
      if (signed.data?.signedUrl) urls.set(file.id, signed.data.signedUrl);
    }),
  );
  return urls;
}

/** Registrations for one event, with the badge card and whether a connection came from it. */
export async function listEventGuests(eventId: string): Promise<EventGuestList> {
  const admin = createAdminSupabaseClient();
  const rows = await registrationRows(eventId);
  const cardIds = [...new Set(rows.map((row) => row.card_id))];
  const userIds = new Set(rows.map((row) => row.user_id));

  const cards = cardIds.length
    ? await admin.from("cards").select("id, display_name, photo_attachment_id").in("id", cardIds)
    : { data: [], error: null };
  if (cards.error) throw new Error(cards.error.message);
  const faces = new Map(
    (cards.data ?? []).map((row) => {
      const card = row as { id: string; display_name: string | null; photo_attachment_id: string | null };
      return [card.id, card] as const;
    }),
  );

  const photoIds = [...faces.values()].map((card) => card.photo_attachment_id).filter((id): id is string => Boolean(id));
  const photos = await photoUrls(photoIds);

  const links = await admin.from("connections").select("owner_id, saved_owner_id").eq("source_event_id", eventId);
  const connected = new Set<string>();
  if (!links.error) {
    for (const row of links.data ?? []) {
      const link = row as { owner_id: string; saved_owner_id: string };
      if (userIds.has(link.owner_id)) connected.add(link.owner_id);
      if (userIds.has(link.saved_owner_id)) connected.add(link.saved_owner_id);
    }
  }

  const guests = rows
    .map((row) => {
      const card = faces.get(row.card_id);
      const photoId = card?.photo_attachment_id ?? null;
      return {
        id: row.id,
        name: guestName(card?.display_name),
        photoUrl: photoId ? photos.get(photoId) ?? null : null,
        paid: row.paid_status === "paid",
        checkedIn: Boolean(row.checked_in_at),
        connected: connected.has(row.user_id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    guests,
    registered: guests.length,
    paid: guests.filter((guest) => guest.paid).length,
    checkedIn: guests.filter((guest) => guest.checkedIn).length,
  };
}

type TokenRow = {
  id: string;
  card_id: string;
  reg_token: string;
  checked_in_at: string | null;
  checked_in_by?: string | null;
  paid_status?: string | null;
};

async function registrationByToken(eventId: string, regToken: string): Promise<TokenRow | null> {
  const admin = createAdminSupabaseClient();
  let paid = true;
  let by = true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const columns = ["id", "card_id", "reg_token", "checked_in_at"];
    if (paid) columns.push("paid_status");
    if (by) columns.push("checked_in_by");
    const result = await admin
      .from("event_registrations")
      .select(columns.join(", "))
      .eq("event_id", eventId)
      .eq("reg_token", regToken)
      .maybeSingle();
    if (!result.error) return (result.data as TokenRow | null) ?? null;
    if (paid && missingColumn(result.error.message, "paid_status")) {
      paid = false;
      continue;
    }
    if (by && missingColumn(result.error.message, "checked_in_by")) {
      by = false;
      continue;
    }
    throw new Error(result.error.message);
  }
  return null;
}

async function cardName(cardId: string): Promise<string> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("cards").select("display_name").eq("id", cardId).maybeSingle();
  if (error) throw new Error(error.message);
  return guestName((data as { display_name?: string | null } | null)?.display_name);
}

/**
 * Stamp arrival. A paid event refuses an unpaid guest — that is the badge gate.
 * A second scan leaves the first time in place.
 */
export async function checkInGuest(lookup: string, userId: string, regToken: string): Promise<CheckInOutcome> {
  let token = regToken.trim();
  try {
    token = decodeURIComponent(token);
  } catch {
    return { ok: false, status: 404, error: "Event badge not found" };
  }
  if (!REG_TOKEN.test(token)) return { ok: false, status: 404, error: "Event badge not found" };

  const access = await loadManageEvent(lookup, userId, "checkin");
  if (access.kind === "missing") return { ok: false, status: 404, error: "Event not found" };
  if (access.kind === "forbidden") return { ok: false, status: 403, error: "Not allowed" };

  const row = await registrationByToken(access.event.id, token);
  if (!row) return { ok: false, status: 404, error: "Event badge not found" };
  const name = await cardName(row.card_id);

  if (access.event.isPaid && row.paid_status != null && row.paid_status !== "paid") {
    return { ok: true, status: "unpaid", name };
  }
  if (row.checked_in_at) {
    return { ok: true, status: "already", name, at: row.checked_in_at };
  }

  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const stamped = await admin
    .from("event_registrations")
    .update({ checked_in_at: now, checked_in_by: userId })
    .eq("id", row.id)
    .is("checked_in_at", null)
    .select("checked_in_at")
    .maybeSingle();
  const wrote = stamped.error && missingColumn(stamped.error.message, "checked_in_by")
    ? await admin
        .from("event_registrations")
        .update({ checked_in_at: now })
        .eq("id", row.id)
        .is("checked_in_at", null)
        .select("checked_in_at")
        .maybeSingle()
    : stamped;
  if (wrote.error) throw new Error(wrote.error.message);
  if (wrote.data?.checked_in_at) {
    return { ok: true, status: "ok", name, at: String(wrote.data.checked_in_at) };
  }

  const again = await admin.from("event_registrations").select("checked_in_at").eq("id", row.id).maybeSingle();
  if (again.error) throw new Error(again.error.message);
  const at = (again.data?.checked_in_at as string | null) ?? now;
  return { ok: true, status: "already", name, at };
}

/** Names the scanner can check in by hand, plus the latest arrival. */
export async function loadCheckinDesk(eventId: string, viewerId: string): Promise<CheckInDesk> {
  const admin = createAdminSupabaseClient();
  const withBy = await admin
    .from("event_registrations")
    .select("card_id, reg_token, checked_in_at, checked_in_by")
    .eq("event_id", eventId);
  const rows = withBy.error && missingColumn(withBy.error.message, "checked_in_by")
    ? await admin.from("event_registrations").select("card_id, reg_token, checked_in_at").eq("event_id", eventId)
    : withBy;
  if (rows.error) throw new Error(rows.error.message);
  const list = (rows.data ?? []) as {
    card_id: string;
    reg_token: string;
    checked_in_at: string | null;
    checked_in_by?: string | null;
  }[];

  const cardIds = [...new Set(list.map((row) => row.card_id))];
  const cards = cardIds.length
    ? await admin.from("cards").select("id, display_name").in("id", cardIds)
    : { data: [], error: null };
  if (cards.error) throw new Error(cards.error.message);
  const names = new Map(
    (cards.data ?? []).map((row) => {
      const card = row as { id: string; display_name: string | null };
      return [card.id, guestName(card.display_name)] as const;
    }),
  );

  const roster = list
    .map((row) => ({ name: names.get(row.card_id) ?? "Untitled", regToken: row.reg_token }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const latest = list
    .filter((row) => row.checked_in_at)
    .sort((a, b) => String(b.checked_in_at).localeCompare(String(a.checked_in_at)))[0];

  return {
    registered: list.length,
    checkedIn: list.filter((row) => row.checked_in_at).length,
    last: latest?.checked_in_at
      ? {
          name: names.get(latest.card_id) ?? "Untitled",
          at: latest.checked_in_at,
          byViewer: latest.checked_in_by === viewerId,
        }
      : null,
    roster,
  };
}
