import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

/** Before phaseN-event-invite-inbox.sql the columns are not there: nothing breaks. */
export function inboxMissing(message: string): boolean {
  return /user_id|declined_at/i.test(message) && /column|schema|find/i.test(message);
}

export type DeclineResult = { ok: true } | { ok: false; status: number; error: string };

const NOT_SAVED = "Could not save that.";

/**
 * Not going after all, from the member page. A going guest gives the seat back:
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