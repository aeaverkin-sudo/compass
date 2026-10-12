import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

const GUEST_TOKEN = /^[A-Za-z0-9_-]{21}$/;

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
