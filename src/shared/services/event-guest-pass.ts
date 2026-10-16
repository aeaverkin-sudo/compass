import { phoneDigits, phonesMatch, PHONE_TAIL_DIGITS } from "@/shared/event/guest-import";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

const GUEST_TOKEN = /^[A-Za-z0-9_-]{21}$/;

/** Carries the personal link through sign-in to the Join that follows. */
export const GUEST_COOKIE = "aded_guest";

export type PassGuest = {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  phone: string | null;
  token: string;
  registrationId: string | null;
  acceptedAt: string | null;
  unsubscribedAt: string | null;
};

type PassGuestRow = {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  token: string;
  registration_id: string | null;
  accepted_at?: string | null;
  unsubscribed_at: string | null;
};

function guestFrom(row: PassGuestRow): PassGuest {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    token: row.token,
    registrationId: row.registration_id,
    acceptedAt: row.accepted_at ?? null,
    unsubscribedAt: row.unsubscribed_at,
  };
}

export function isGuestToken(value: unknown): value is string {
  return typeof value === "string" && GUEST_TOKEN.test(value);
}

/**
 * The guest behind a personal link, on this event only. A token from another
 * event, a broken one, or a database without guest lists finds nobody.
 */
export async function findPassGuest(eventId: string, token: unknown): Promise<PassGuest | null> {
  if (!isGuestToken(token)) return null;
  const admin = createAdminSupabaseClient();
  const base = "id, event_id, name, email, phone, token, registration_id, unsubscribed_at";
  let result = await admin.from("event_guests").select(`${base}, accepted_at`).eq("event_id", eventId).eq("token", token).maybeSingle();
  if (result.error && /accepted_at/i.test(result.error.message)) {
    result = await admin.from("event_guests").select(base).eq("event_id", eventId).eq("token", token).maybeSingle();
  }
  if (result.error || !result.data) return null;
  return guestFrom(result.data as PassGuestRow);
}

/** The personal link of this token, wherever its event is. It enters the pass by itself. */
export async function guestEntryPath(token: unknown): Promise<string | null> {
  if (!isGuestToken(token)) return null;
  const admin = createAdminSupabaseClient();
  const guest = await admin.from("event_guests").select("event_id").eq("token", token).maybeSingle();
  if (guest.error || !guest.data) return null;
  const eventId = (guest.data as { event_id: string }).event_id;
  const withSlug = await admin.from("events").select("code, slug").eq("id", eventId).maybeSingle();
  const event = withSlug.error && /slug/i.test(withSlug.error.message)
    ? await admin.from("events").select("code").eq("id", eventId).maybeSingle()
    : withSlug;
  if (event.error || !event.data) return null;
  const row = event.data as { slug?: string | null; code: string };
  return `/e/${encodeURIComponent(row.slug?.trim() || row.code)}?g=${token}&go=1`;
}

/** First open of the personal link. Called from the page script, not on GET. */
export async function markGuestOpened(eventId: string, token: unknown): Promise<boolean> {
  if (!isGuestToken(token)) return false;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("event_guests")
    .update({ opened_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("token", token)
    .is("opened_at", null)
    .select("id");
  if (error) return false;
  return (data ?? []).length > 0;
}

async function linkByToken(eventId: string, registrationId: string, token: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  let linked = await admin
    .from("event_guests")
    .update({ registration_id: registrationId, accepted_at: now })
    .eq("event_id", eventId)
    .eq("token", token)
    .is("registration_id", null)
    .select("id");
  if (linked.error && /accepted_at/i.test(linked.error.message)) {
    linked = await admin
      .from("event_guests")
      .update({ registration_id: registrationId })
      .eq("event_id", eventId)
      .eq("token", token)
      .is("registration_id", null)
      .select("id");
  }
  if (linked.error) throw new Error(linked.error.message);
  if ((linked.data ?? []).length > 0) return;
  const stamped = await admin
    .from("event_guests")
    .update({ accepted_at: now })
    .eq("event_id", eventId)
    .eq("token", token)
    .eq("registration_id", registrationId)
    .is("accepted_at", null);
  if (stamped.error && !/accepted_at/i.test(stamped.error.message)) throw new Error(stamped.error.message);
}

/** A contact typed on the open link, instead of the account's own. */
export type GuestContact = { email: string | null; phone: string | null };

async function linkByContact(eventId: string, registrationId: string, userId: string, typed: GuestContact | null): Promise<void> {
  const admin = createAdminSupabaseClient();
  const taken = await admin.from("event_guests").select("id").eq("registration_id", registrationId).limit(1);
  if (taken.error) throw new Error(taken.error.message);
  if ((taken.data ?? []).length > 0) return;

  const loaded = typed ? null : await admin.auth.admin.getUserById(userId);
  const email = (typed ? typed.email : loaded?.data.user?.email)?.trim().toLowerCase();
  if (email) {
    const byEmail = await admin
      .from("event_guests")
      .update({ registration_id: registrationId })
      .eq("event_id", eventId)
      .eq("email", email)
      .is("registration_id", null)
      .select("id");
    if (byEmail.error) throw new Error(byEmail.error.message);
    if ((byEmail.data ?? []).length > 0) return;
  }

  const phone = (typed ? typed.phone : loaded?.data.user?.phone)?.trim();
  if (!phone) return;
  const tail = phoneDigits(phone).slice(-PHONE_TAIL_DIGITS);
  if (tail.length < PHONE_TAIL_DIGITS) return;
  const near = await admin
    .from("event_guests")
    .select("id, phone")
    .eq("event_id", eventId)
    .is("registration_id", null)
    .like("phone", `%${tail}`);
  if (near.error) throw new Error(near.error.message);
  const match = ((near.data ?? []) as { id: string; phone: string | null }[]).find((row) => row.phone && phonesMatch(row.phone, phone));
  if (!match) return;
  const byPhone = await admin.from("event_guests").update({ registration_id: registrationId }).eq("id", match.id).is("registration_id", null);
  if (byPhone.error) throw new Error(byPhone.error.message);
}

/**
 * A registration finds its list guest. The personal link names the guest and
 * marks the acceptance; otherwise the account's email, then its phone.
 * A missing guest table or a taken guest leaves the registration as it is.
 */
export async function linkGuestOnRegister(
  eventId: string,
  registrationId: string,
  userId: string,
  guestToken?: string | null,
  typed: GuestContact | null = null,
): Promise<void> {
  try {
    if (isGuestToken(guestToken)) await linkByToken(eventId, registrationId, guestToken);
    else await linkByContact(eventId, registrationId, userId, typed);
  } catch (error) {
    console.error("[events] guest link", error);
  }
}
