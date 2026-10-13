import { createHash } from "node:crypto";
import { phoneDigits, phonesMatch, PHONE_TAIL_DIGITS } from "@/shared/event/guest-import";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

export const PASS_LIMIT = 5;
export const PASS_WINDOW_MS = 10 * 60 * 1000;
export const TRY_LATER = "Try again in a few minutes";

/** The first hop of x-forwarded-for is the client on Render. */
export function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** The address is never stored. Only its hash, per event. */
function ipKey(eventId: string, ip: string): string {
  return createHash("sha256").update(`${eventId}:${ip}`).digest("hex");
}

const memory = new Map<string, number[]>();

function memoryRecent(key: string, since: number): number[] {
  const kept = (memory.get(key) ?? []).filter((at) => at > since);
  memory.set(key, kept);
  return kept;
}

/** True while this address made fewer than five passes on this event in ten minutes. */
export async function passAllowed(eventId: string, ip: string): Promise<boolean> {
  const key = ipKey(eventId, ip);
  const since = Date.now() - PASS_WINDOW_MS;
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("event_pass_attempts")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("ip_hash", key)
    .gt("created_at", new Date(since).toISOString());
  if (error) return memoryRecent(key, since).length < PASS_LIMIT;
  return (count ?? 0) < PASS_LIMIT;
}

export async function recordPass(eventId: string, ip: string): Promise<void> {
  const key = ipKey(eventId, ip);
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("event_pass_attempts").insert({ event_id: eventId, ip_hash: key });
  if (!error) {
    const old = new Date(Date.now() - PASS_WINDOW_MS * 6).toISOString();
    await admin.from("event_pass_attempts").delete().lt("created_at", old);
    return;
  }
  memoryRecent(key, Date.now() - PASS_WINDOW_MS).push(Date.now());
}

/**
 * The account on this event that already carries this contact: a list guest
 * it was linked to, or the contact row on its pass card.
 */
export async function holderOfContact(
  eventId: string,
  contact: { email: string | null; phone: string | null },
): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const regs = await admin.from("event_registrations").select("id, user_id").eq("event_id", eventId);
  if (regs.error) throw new Error(regs.error.message);
  const rows = (regs.data ?? []) as { id: string; user_id: string }[];
  if (rows.length === 0) return null;
  const userOf = new Map(rows.map((row) => [row.id, row.user_id]));
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const guests = await admin
    .from("event_guests")
    .select("registration_id, email, phone")
    .eq("event_id", eventId)
    .not("registration_id", "is", null);
  const guestRows = guests.error ? [] : ((guests.data ?? []) as { registration_id: string; email: string | null; phone: string | null }[]);
  for (const guest of guestRows) {
    const same = contact.email
      ? guest.email?.trim().toLowerCase() === contact.email
      : Boolean(contact.phone && guest.phone && phonesMatch(guest.phone, contact.phone));
    if (same && userOf.has(guest.registration_id)) return userOf.get(guest.registration_id)!;
  }

  if (contact.email) {
    const items = await admin.from("items").select("owner_id").eq("type", "email").eq("value", contact.email).in("owner_id", userIds).limit(1);
    if (items.error) throw new Error(items.error.message);
    return ((items.data ?? []) as { owner_id: string }[])[0]?.owner_id ?? null;
  }
  const phone = contact.phone;
  if (!phone || phoneDigits(phone).length < PHONE_TAIL_DIGITS) return null;
  const items = await admin.from("items").select("owner_id, value").eq("type", "phone").in("owner_id", userIds);
  if (items.error) throw new Error(items.error.message);
  const match = ((items.data ?? []) as { owner_id: string; value: string | null }[]).find(
    (item) => item.value && phonesMatch(item.value, phone),
  );
  return match?.owner_id ?? null;
}
