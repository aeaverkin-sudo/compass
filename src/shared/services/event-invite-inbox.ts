import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventTitleLine } from "@/shared/event/event-title";
import { eventDayLong, formatEventRange } from "@/shared/event/when";
import { userIdForEmail } from "@/shared/services/email-signup";
import { loadEventTimeZones } from "@/shared/services/event-time-zone";
import { eventListStatus } from "@/shared/services/events";
import { isPermanentAccount } from "@/shared/services/guest-accept";
import { posterUrl } from "@/shared/services/poster-snapshot";

/** One invitation in Network › Events. */
export type InboxInvite = {
  token: string;
  /** Slug or code, for the poster and the API. */
  key: string;
  name: string;
  when: string | null;
  place: string | null;
  organiser: string | null;
  posterSrc: string;
  startsAt: string | null;
};

/** Not going, until the event ends. Change goes back to going. */
export type InboxDeclined = { token: string; key: string; name: string; day: string | null; startsAt: string | null };

/** Before phaseN-event-invite-inbox.sql the columns are not there: no inbox, nothing breaks. */
export function inboxMissing(message: string): boolean {
  return /user_id|declined_at/i.test(message) && /column|schema|find/i.test(message);
}

async function memberId(email: string): Promise<string | null> {
  const userId = await userIdForEmail(email).catch(() => null);
  if (!userId) return null;
  return (await isPermanentAccount({ id: userId, anonymous: false })) ? userId : null;
}

/**
 * Send: each guest whose email is an account's confirmed address gets that account.
 * The ids that matched get the account line in the mail.
 */
export async function linkGuestAccounts(guests: { id: string; email: string }[]): Promise<Set<string>> {
  const members = new Set<string>();
  const admin = createAdminSupabaseClient();
  await Promise.all(
    guests.map(async (guest) => {
      const userId = await memberId(guest.email);
      if (!userId) return;
      members.add(guest.id);
      const { error } = await admin.from("event_guests").update({ user_id: userId }).eq("id", guest.id);
      if (error && !inboxMissing(error.message)) console.error("[events] guest account", error.message);
    }),
  );
  return members;
}

/** Sign-in or registration: invitations waiting for this account's confirmed address become its own. */
export async function claimInvitations(userId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const email = (await admin.auth.admin.getUserById(userId)).data.user?.email?.trim().toLowerCase();
  if (!email) return;
  const { error } = await admin.from("event_guests").update({ user_id: userId }).eq("email", email).is("user_id", null);
  if (error && !inboxMissing(error.message)) console.error("[events] claim invitations", error.message);
}

type GuestRow = { token: string; event_id: string; registration_id: string | null; declined_at: string | null };

type EventRow = {
  id: string;
  name: string;
  date: string | null;
  ends_at?: string | null;
  place: string | null;
  place_secret: boolean | null;
  code: string;
  slug?: string | null;
  owner_id: string;
  poster_path?: string | null;
  poster_updated_at?: string | null;
};

async function loadEvents(ids: string[]): Promise<EventRow[]> {
  if (ids.length === 0) return [];
  const admin = createAdminSupabaseClient();
  const base = "id, name, date, ends_at, place, place_secret, code, slug, owner_id";
  const full = await admin.from("events").select(`${base}, poster_path, poster_updated_at`).in("id", ids);
  const loaded = full.error ? await admin.from("events").select(base).in("id", ids) : full;
  if (loaded.error) throw new Error(loaded.error.message);
  return (loaded.data ?? []) as EventRow[];
}

/** The organiser's card name. No card name, no line. */
async function organiserNames(ownerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ownerIds.length === 0) return out;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("cards")
    .select("owner_id, display_name, is_primary, created_at")
    .in("owner_id", ownerIds)
    .order("created_at", { ascending: true });
  if (error) return out;
  const rows = (data ?? []) as { owner_id: string; display_name: string | null; is_primary: boolean | null }[];
  for (const ownerId of ownerIds) {
    const own = rows.filter((row) => row.owner_id === ownerId && (row.display_name ?? "").trim());
    const pick = own.find((row) => row.is_primary) ?? own[0];
    if (pick) out.set(ownerId, (pick.display_name ?? "").replace(/\s+/g, " ").trim());
  }
  return out;
}

async function inboxRows(userId: string): Promise<GuestRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("event_guests")
    .select("token, event_id, registration_id, declined_at")
    .eq("user_id", userId)
    .not("sent_at", "is", null);
  if (error) {
    if (inboxMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as GuestRow[];
}

/** Events this account already joined some other way. */
async function joinedEventIds(userId: string): Promise<Set<string>> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("event_registrations").select("event_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { event_id: string }[]).map((row) => row.event_id));
}

export type Inbox = { invited: InboxInvite[]; declined: InboxDeclined[] };

/**
 * Invitations sent to this account with no answer yet: not going, not declined, the event still ahead.
 * Declined ones stay as a grey row until the event ends. Waiting invitations for its address are picked up first.
 */
export async function loadInbox(userId: string, origin: string, now = Date.now()): Promise<Inbox> {
  if (!(await isPermanentAccount({ id: userId, anonymous: false }))) return { invited: [], declined: [] };
  await claimInvitations(userId);
  const rows = (await inboxRows(userId)).filter((row) => !row.registration_id);
  if (rows.length === 0) return { invited: [], declined: [] };
  const joined = await joinedEventIds(userId);
  const open = rows.filter((row) => !joined.has(row.event_id));
  const events = await loadEvents([...new Set(open.map((row) => row.event_id))]);
  const ahead = events.filter((event) => eventListStatus(event.date, now, event.ends_at ?? null) !== "past");
  const byId = new Map(ahead.map((event) => [event.id, event]));
  const [zones, organisers] = await Promise.all([
    loadEventTimeZones(ahead.map((event) => event.id)),
    organiserNames([...new Set(ahead.map((event) => event.owner_id))]),
  ]);
  const start = (row: GuestRow) => {
    const date = byId.get(row.event_id)?.date;
    return date ? new Date(date).getTime() : Number.MAX_SAFE_INTEGER;
  };
  const out: Inbox = { invited: [], declined: [] };
  for (const row of [...open].sort((left, right) => start(left) - start(right))) {
    const event = byId.get(row.event_id);
    if (!event) continue;
    const key = encodeURIComponent(event.slug?.trim() || event.code);
    if (row.declined_at) {
      out.declined.push({
        token: row.token,
        key,
        name: eventTitleLine(event.name),
        day: eventDayLong(event.date, zones.get(event.id)),
        startsAt: event.date,
      });
      continue;
    }
    out.invited.push({
      token: row.token,
      key,
      name: eventTitleLine(event.name),
      when: formatEventRange(event.date, event.ends_at ?? null, zones.get(event.id)),
      place: event.place_secret ? null : event.place?.trim() || null,
      organiser: organisers.get(event.owner_id) ?? null,
      posterSrc: posterUrl(event.poster_path, event.poster_updated_at) ?? `${origin}/e/${key}/opengraph-image`,
      startsAt: event.date,
    });
  }
  return out;
}

export type DeclineResult = { ok: true } | { ok: false; status: number; error: string };

const NOT_SAVED = "Could not save that.";

/**
 * Not going, from Invited, the poster or the member page. A going guest gives the seat back:
 * the answer is stamped on the guest row first, then the registration goes. A checked-in or a paid
 * registration stays: there is nothing to give back.
 */
export async function declineInvitation(eventId: string, userId: string | null, token: string | null): Promise<DeclineResult> {
  const admin = createAdminSupabaseClient();
  type Answered = { id: string; registration_id: string | null };
  let guest: Answered | null = null;
  if (token) {
    const found = await admin.from("event_guests").select("id, registration_id").eq("event_id", eventId).eq("token", token).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    guest = found.data as Answered | null;
    if (!guest) return { ok: false, status: 404, error: "Invitation not found" };
  }
  let registrationId = guest?.registration_id ?? null;
  if (!guest && userId) {
    const own = await admin.from("event_registrations").select("id").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
    if (own.error) throw new Error(own.error.message);
    registrationId = (own.data as { id: string } | null)?.id ?? null;
    if (registrationId) {
      const linked = await admin.from("event_guests").select("id, registration_id").eq("registration_id", registrationId).maybeSingle();
      if (linked.error) throw new Error(linked.error.message);
      guest = linked.data as Answered | null;
    }
  }
  if (!guest && !registrationId) return { ok: false, status: 404, error: "Invitation not found" };

  if (registrationId) {
    const reg = await admin.from("event_registrations").select("user_id, checked_in_at, paid_status").eq("id", registrationId).maybeSingle();
    if (reg.error) throw new Error(reg.error.message);
    const row = reg.data as { user_id: string; checked_in_at: string | null; paid_status: string | null } | null;
    if (row && row.user_id !== userId) return { ok: false, status: 403, error: "Not allowed" };
    if (row && (row.checked_in_at || row.paid_status === "paid")) return { ok: false, status: 409, error: NOT_SAVED };
  }
  if (guest) {
    const stamped = await admin.from("event_guests").update({ declined_at: new Date().toISOString() }).eq("id", guest.id);
    if (stamped.error) {
      if (inboxMissing(stamped.error.message)) return { ok: false, status: 409, error: NOT_SAVED };
      throw new Error(stamped.error.message);
    }
  }
  if (registrationId) {
    const removed = await admin.from("event_registrations").delete().eq("id", registrationId).eq("user_id", userId ?? "");
    if (removed.error) throw new Error(removed.error.message);
  }
  return { ok: true };
}