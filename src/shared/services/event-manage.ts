import { nanoid } from "nanoid";
import {
  allPermissions,
  anyPermission,
  managerCap,
  permissionsOf,
  teamRole,
  type EventPermission,
  type EventPermissions,
  type TeamRoleName,
} from "@/shared/event/permissions";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { CARD_ATTACHMENTS_BUCKET, SIGNED_READ_SECONDS } from "@/shared/services/attachment-limits";
import { loadEventInvite, type EventInvite } from "@/shared/services/event-invite";
import { eventListStatus, type EventListStatus } from "@/shared/services/events";

export {
  EVENT_PERMISSIONS,
  MANAGE_SECTIONS,
  PERMISSION_LABEL,
  accessLine,
  managerCap,
  permissionsOf,
  visibleSections,
} from "@/shared/event/permissions";
export type { EventPermission, EventPermissions, ManageSection } from "@/shared/event/permissions";

const REG_TOKEN = /^[A-Za-z0-9_-]{21}$/;

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
  userId: string;
  name: string;
  photoUrl: string | null;
  paid: boolean;
  paidStatus: string | null;
  paidSource: string | null;
  cardToken: string | null;
  checkedIn: boolean;
  connected: boolean;
  registeredAt: string | null;
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
  | { ok: true; status: "pending"; name: string; payCode: string | null }
  | { ok: false; status: number; error: string };

export type CheckInDesk = {
  registered: number;
  checkedIn: number;
  last: { name: string; at: string; byViewer: boolean } | null;
  roster: { name: string; regToken: string }[];
};

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
  return permissionsOf((data as { permissions?: unknown }).permissions);
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

type CountRow = { paid_status?: string | null; paid_source?: string | null; checked_in_at?: string | null };

function isConfirmed(status: string | null | undefined, source: string | null | undefined, sourceKnown: boolean): boolean {
  if (status !== "paid") return false;
  if (!sourceKnown) return true;
  return source === "statement" || source === "name" || source === "manual";
}

async function countGuests(eventId: string): Promise<{ registered: number; paid: number; checkedIn: number }> {
  const admin = createAdminSupabaseClient();
  const withSource = await admin.from("event_registrations").select("paid_status, paid_source, checked_in_at").eq("event_id", eventId);
  let sourceKnown = true;
  let list: CountRow[] = [];
  if (!withSource.error) {
    list = (withSource.data ?? []) as CountRow[];
  } else if (missingColumn(withSource.error.message, "paid_source")) {
    sourceKnown = false;
    const withPaid = await admin.from("event_registrations").select("paid_status, checked_in_at").eq("event_id", eventId);
    if (!withPaid.error) {
      list = (withPaid.data ?? []) as CountRow[];
    } else if (missingColumn(withPaid.error.message, "paid_status")) {
      const basic = await admin.from("event_registrations").select("checked_in_at").eq("event_id", eventId);
      if (basic.error) throw new Error(basic.error.message);
      list = (basic.data ?? []) as CountRow[];
    } else {
      throw new Error(withPaid.error.message);
    }
  } else if (missingColumn(withSource.error.message, "paid_status")) {
    sourceKnown = false;
    const basic = await admin.from("event_registrations").select("checked_in_at").eq("event_id", eventId);
    if (basic.error) throw new Error(basic.error.message);
    list = (basic.data ?? []) as CountRow[];
  } else {
    throw new Error(withSource.error.message);
  }
  return {
    registered: list.length,
    paid: list.filter((row) => isConfirmed(row.paid_status, row.paid_source, sourceKnown)).length,
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
  paid_source?: string | null;
  checked_in_at?: string | null;
  created_at?: string | null;
};

async function registrationRows(eventId: string): Promise<{ rows: GuestRow[]; sourceKnown: boolean }> {
  const admin = createAdminSupabaseClient();
  const withSource = await admin
    .from("event_registrations")
    .select("id, user_id, card_id, paid_status, paid_source, checked_in_at, created_at")
    .eq("event_id", eventId);
  if (!withSource.error) return { rows: (withSource.data ?? []) as GuestRow[], sourceKnown: true };
  if (missingColumn(withSource.error.message, "paid_source")) {
    const withPaid = await admin
      .from("event_registrations")
      .select("id, user_id, card_id, paid_status, checked_in_at, created_at")
      .eq("event_id", eventId);
    if (!withPaid.error) return { rows: (withPaid.data ?? []) as GuestRow[], sourceKnown: false };
    if (withPaid.error && missingColumn(withPaid.error.message, "paid_status")) {
      const basic = await admin.from("event_registrations").select("id, user_id, card_id, checked_in_at, created_at").eq("event_id", eventId);
      if (basic.error) throw new Error(basic.error.message);
      return { rows: (basic.data ?? []) as GuestRow[], sourceKnown: false };
    }
    throw new Error(withPaid.error.message);
  }
  if (missingColumn(withSource.error.message, "paid_status")) {
    const basic = await admin.from("event_registrations").select("id, user_id, card_id, checked_in_at, created_at").eq("event_id", eventId);
    if (basic.error) throw new Error(basic.error.message);
    return { rows: (basic.data ?? []) as GuestRow[], sourceKnown: false };
  }
  throw new Error(withSource.error.message);
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
  const { rows, sourceKnown } = await registrationRows(eventId);
  const cardIds = [...new Set(rows.map((row) => row.card_id))];
  const userIds = new Set(rows.map((row) => row.user_id));

  const cards = cardIds.length
    ? await admin.from("cards").select("id, display_name, photo_attachment_id, public_token").in("id", cardIds)
    : { data: [], error: null };
  if (cards.error) throw new Error(cards.error.message);
  const faces = new Map(
    (cards.data ?? []).map((row) => {
      const card = row as { id: string; display_name: string | null; photo_attachment_id: string | null; public_token: string | null };
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
        userId: row.user_id,
        name: guestName(card?.display_name),
        photoUrl: photoId ? photos.get(photoId) ?? null : null,
        paid: isConfirmed(row.paid_status, row.paid_source, sourceKnown),
        paidStatus: row.paid_status ?? null,
        paidSource: sourceKnown ? row.paid_source ?? null : row.paid_status === "paid" ? "manual" : null,
        cardToken: card?.public_token ?? null,
        checkedIn: Boolean(row.checked_in_at),
        connected: connected.has(row.user_id),
        registeredAt: row.created_at ?? null,
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
  paid_source?: string | null;
  pay_code?: string | null;
  sourceKnown: boolean;
};

async function registrationByToken(eventId: string, regToken: string): Promise<TokenRow | null> {
  const admin = createAdminSupabaseClient();
  const optional = ["paid_status", "paid_source", "pay_code", "checked_in_by"];
  const dropped = new Set<string>();
  for (let attempt = 0; attempt < optional.length + 1; attempt += 1) {
    const columns = ["id", "card_id", "reg_token", "checked_in_at", ...optional.filter((column) => !dropped.has(column))];
    const result = await admin
      .from("event_registrations")
      .select(columns.join(", "))
      .eq("event_id", eventId)
      .eq("reg_token", regToken)
      .maybeSingle();
    if (!result.error) {
      const row = result.data as Omit<TokenRow, "sourceKnown"> | null;
      return row ? { ...row, sourceKnown: !dropped.has("paid_source") } : null;
    }
    const missing = optional.find((column) => !dropped.has(column) && missingColumn(result.error.message, column));
    if (!missing) throw new Error(result.error.message);
    dropped.add(missing);
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
 * Stamp arrival. A paid event that is not confirmed waits for an explicit confirm.
 * A second scan leaves the first time in place.
 */
export async function checkInGuest(lookup: string, userId: string, regToken: string, confirm = false): Promise<CheckInOutcome> {
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

  const confirmed = isConfirmed(row.paid_status, row.paid_source, row.sourceKnown);
  if (access.event.isPaid && !confirmed) {
    if (!confirm) return { ok: true, status: "pending", name, payCode: row.pay_code?.trim() || null };
    const admin = createAdminSupabaseClient();
    const marked = await admin
      .from("event_registrations")
      .update({ paid_status: "paid", paid_source: "manual" })
      .eq("id", row.id)
      .or("paid_source.is.null,paid_source.eq.return");
    if (marked.error && missingColumn(marked.error.message, "paid_source")) {
      const basic = await admin.from("event_registrations").update({ paid_status: "paid" }).eq("id", row.id);
      if (basic.error) throw new Error(basic.error.message);
    } else if (marked.error) {
      throw new Error(marked.error.message);
    }
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

export type EventManager = {
  userId: string;
  name: string;
  photoUrl: string | null;
  permissions: EventPermissions;
};

export type ManagerCall =
  | { ok: true }
  | { ok: true; token: string; publicToken: string }
  | { ok: false; status: number; error: string };

async function personFace(userId: string): Promise<{ name: string; photoUrl: string | null }> {
  const admin = createAdminSupabaseClient();
  const cards = await admin
    .from("cards")
    .select("display_name, photo_attachment_id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  const list = cards.error ? [] : ((cards.data ?? []) as { display_name: string | null; photo_attachment_id: string | null }[]);
  const named = list.find((card) => (card.display_name ?? "").trim()) ?? list[0];
  const cardName = (named?.display_name ?? "").trim();
  let email = "";
  if (!cardName) {
    const user = await admin.auth.admin.getUserById(userId);
    email = user.data.user?.email?.trim() ?? "";
  }
  const photoId = named?.photo_attachment_id ?? null;
  const photos = photoId ? await photoUrls([photoId]) : new Map<string, string>();
  return {
    name: cardName || email || "Manager",
    photoUrl: photoId ? photos.get(photoId) ?? null : null,
  };
}

/** Staff on this event. The owner is not a row. */
export async function listEventManagers(eventId: string): Promise<EventManager[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("event_team").select("user_id, permissions").eq("event_id", eventId);
  if (error) {
    if (missingTable(error.message, "event_team")) return [];
    throw new Error(error.message);
  }
  const rows = (data ?? []) as { user_id: string; permissions?: unknown }[];
  const managers = await Promise.all(
    rows.map(async (row) => {
      const face = await personFace(row.user_id);
      return {
        userId: row.user_id,
        name: face.name,
        photoUrl: face.photoUrl,
        permissions: permissionsOf(row.permissions),
      };
    }),
  );
  return managers.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createManagerInvite(
  lookup: string,
  userId: string,
  permissions: EventPermissions,
): Promise<ManagerCall> {
  const access = await loadManageEvent(lookup, userId, "team");
  if (access.kind === "missing") return { ok: false, status: 404, error: "Event not found" };
  if (access.kind === "forbidden") return { ok: false, status: 403, error: "Not allowed" };
  if (!anyPermission(permissions)) return { ok: false, status: 400, error: "Choose a permission." };
  if (access.event.managers >= managerCap()) {
    return { ok: false, status: 409, error: "This event already has 5 managers." };
  }
  const admin = createAdminSupabaseClient();
  const token = nanoid(21);
  const inserted = await admin.from("event_manager_invites").insert({
    token,
    event_id: access.event.id,
    permissions,
    created_by: userId,
  });
  if (inserted.error) throw new Error(inserted.error.message);
  return { ok: true, token, publicToken: access.event.publicToken };
}

async function teamAccess(lookup: string, userId: string): Promise<ManageLoad> {
  return loadManageEvent(lookup, userId, "team");
}

export async function updateManagerPermissions(
  lookup: string,
  actorId: string,
  targetId: string,
  permissions: EventPermissions,
): Promise<ManagerCall> {
  const access = await teamAccess(lookup, actorId);
  if (access.kind === "missing") return { ok: false, status: 404, error: "Event not found" };
  if (access.kind === "forbidden") return { ok: false, status: 403, error: "Not allowed" };
  const admin = createAdminSupabaseClient();
  const updated = await admin
    .from("event_team")
    .update({ permissions })
    .eq("event_id", access.event.id)
    .eq("user_id", targetId)
    .select("user_id")
    .maybeSingle();
  if (updated.error) throw new Error(updated.error.message);
  if (!updated.data) return { ok: false, status: 404, error: "Manager not found" };
  return { ok: true };
}

export async function removeManager(lookup: string, actorId: string, targetId: string): Promise<ManagerCall> {
  const access = await teamAccess(lookup, actorId);
  if (access.kind !== "ok" || access.event.role !== "owner") {
    return { ok: false, status: access.kind === "missing" ? 404 : 403, error: access.kind === "missing" ? "Event not found" : "Not allowed" };
  }
  const admin = createAdminSupabaseClient();
  const removed = await admin
    .from("event_team")
    .delete()
    .eq("event_id", access.event.id)
    .eq("user_id", targetId)
    .select("user_id");
  if (removed.error) throw new Error(removed.error.message);
  if (!removed.data?.length) return { ok: false, status: 404, error: "Manager not found" };
  return { ok: true };
}

type InviteHit =
  | { kind: "missing" }
  | { kind: "used" }
  | {
      kind: "open";
      invite: EventInvite;
      permissions: EventPermissions;
      createdBy: string;
    };

/** The invite row, without asking who is looking. A bad or spent token stays empty. */
async function readInviteHit(lookup: string, token: string): Promise<InviteHit> {
  let key = token.trim();
  try {
    key = decodeURIComponent(key);
  } catch {
    return { kind: "missing" };
  }
  if (!REG_TOKEN.test(key)) return { kind: "missing" };
  const invite = await loadEventInvite(lookup);
  if (!invite) return { kind: "missing" };
  const admin = createAdminSupabaseClient();
  const row = await admin
    .from("event_manager_invites")
    .select("permissions, used_at, created_by")
    .eq("token", key)
    .eq("event_id", invite.id)
    .maybeSingle();
  if (row.error) {
    if (missingTable(row.error.message, "event_manager_invites")) return { kind: "missing" };
    throw new Error(row.error.message);
  }
  if (!row.data) return { kind: "missing" };
  const data = row.data as { permissions?: unknown; used_at: string | null; created_by: string };
  if (data.used_at) return { kind: "used" };
  return { kind: "open", invite, permissions: permissionsOf(data.permissions), createdBy: data.created_by };
}

export type InvitePreview =
  | { kind: "missing" }
  | { kind: "used" }
  | {
      kind: "open";
      eventName: string;
      ownerName: string;
      date: string | null;
      endsAt: string | null;
      place: string | null;
      placeSecret: boolean;
      theme: EventThemeId;
      layout: EventLayoutId;
      logoUrl: string | null;
      description: string | null;
      role: TeamRoleName;
      roleDetail: string;
    };

/** Link-preview facts for a team invite. No viewer check, and a bad token returns nothing about the event. */
export async function loadInvitePreview(lookup: string, token: string): Promise<InvitePreview> {
  const hit = await readInviteHit(lookup, token);
  if (hit.kind !== "open") return { kind: hit.kind };
  const face = hit.createdBy ? await personFace(hit.createdBy) : { name: "The organiser", photoUrl: null };
  const { invite } = hit;
  const role = teamRole(hit.permissions);
  return {
    kind: "open",
    eventName: invite.name,
    ownerName: face.name === "Manager" ? "The organiser" : face.name,
    date: invite.date,
    endsAt: invite.endsAt,
    place: invite.place,
    placeSecret: invite.placeSecret,
    theme: invite.theme,
    layout: invite.layout,
    logoUrl: invite.logoAttachmentId ? `/e/${invite.publicToken}/logo` : null,
    description: invite.description,
    role: role.role,
    roleDetail: role.detail,
  };
}

export type ManagerInviteView =
  | { kind: "missing" }
  | { kind: "used" }
  | { kind: "owner"; eventName: string }
  | {
      kind: "open";
      eventName: string;
      ownerName: string;
      role: TeamRoleName;
      roleDetail: string;
      description: string | null;
      date: string | null;
      endsAt: string | null;
      place: string | null;
      placeSecret: boolean;
      theme: EventThemeId;
      layout: EventLayoutId;
      logoUrl: string | null;
    };

export async function loadManagerInvite(lookup: string, token: string, userId: string): Promise<ManagerInviteView> {
  const hit = await readInviteHit(lookup, token);
  if (hit.kind !== "open") return { kind: hit.kind };
  const { invite } = hit;
  const owner = await readOwnerPaid(invite.id);
  if (owner && owner.ownerId === userId) return { kind: "owner", eventName: invite.name };
  const face = hit.createdBy ? await personFace(hit.createdBy) : { name: "The organiser", photoUrl: null };
  const role = teamRole(hit.permissions);
  return {
    kind: "open",
    eventName: invite.name,
    ownerName: face.name === "Manager" ? "The organiser" : face.name,
    role: role.role,
    roleDetail: role.detail,
    description: invite.description,
    date: invite.date,
    endsAt: invite.endsAt,
    place: invite.place,
    placeSecret: invite.placeSecret,
    theme: invite.theme,
    layout: invite.layout,
    logoUrl: invite.logoAttachmentId ? `/e/${invite.publicToken}/logo` : null,
  };
}

export async function acceptManagerInvite(lookup: string, userId: string, token: string): Promise<ManagerCall> {
  let key = token.trim();
  try {
    key = decodeURIComponent(key);
  } catch {
    return { ok: false, status: 404, error: "This link has already been used." };
  }
  if (!REG_TOKEN.test(key)) return { ok: false, status: 404, error: "This link has already been used." };
  const invite = await loadEventInvite(lookup);
  if (!invite) return { ok: false, status: 404, error: "Event not found" };
  const admin = createAdminSupabaseClient();
  const row = await admin
    .from("event_manager_invites")
    .select("permissions, used_at")
    .eq("token", key)
    .eq("event_id", invite.id)
    .maybeSingle();
  if (row.error) throw new Error(row.error.message);
  if (!row.data) return { ok: false, status: 404, error: "This link has already been used." };
  const data = row.data as { permissions?: unknown; used_at: string | null };
  if (data.used_at) return { ok: false, status: 409, error: "This link has already been used." };
  const owner = await readOwnerPaid(invite.id);
  if (owner && owner.ownerId === userId) return { ok: false, status: 403, error: "You organise this event." };

  const existing = await admin
    .from("event_team")
    .select("user_id")
    .eq("event_id", invite.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  const already = Boolean(existing.data);
  if (!already && (await countManagers(invite.id)) >= managerCap()) {
    return { ok: false, status: 409, error: "This event already has 5 managers." };
  }

  const claimed = await admin
    .from("event_manager_invites")
    .update({ used_by: userId, used_at: new Date().toISOString() })
    .eq("token", key)
    .is("used_at", null)
    .select("token");
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data?.length) return { ok: false, status: 409, error: "This link has already been used." };

  const permissions = permissionsOf(data.permissions);
  const saved = already
    ? await admin.from("event_team").update({ permissions }).eq("event_id", invite.id).eq("user_id", userId)
    : await admin.from("event_team").insert({ event_id: invite.id, user_id: userId, permissions });
  if (saved.error) {
    await admin.from("event_manager_invites").update({ used_by: null, used_at: null }).eq("token", key).eq("used_by", userId);
    throw new Error(saved.error.message);
  }
  return { ok: true };
}
