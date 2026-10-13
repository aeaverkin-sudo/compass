import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { mailConfigured, sendFreezeNotice } from "@/shared/services/mail";

const BATCH = 50;

type GuestRow = { token: string; email: string | null; unsubscribed_at: string | null; event_id: string };
type EventRow = { id: string; name: string; code: string; slug?: string | null };

async function readEvent(eventId: string): Promise<EventRow | null> {
  const admin = createAdminSupabaseClient();
  const full = await admin.from("events").select("id, name, code, slug").eq("id", eventId).maybeSingle();
  if (!full.error) return (full.data as EventRow | null) ?? null;
  if (!/slug/i.test(full.error.message)) throw new Error(full.error.message);
  const kept = await admin.from("events").select("id, name, code").eq("id", eventId).maybeSingle();
  if (kept.error) throw new Error(kept.error.message);
  return (kept.data as EventRow | null) ?? null;
}

/** The guest row behind this account's latest event registration. */
async function latestGuest(userId: string): Promise<GuestRow | null> {
  const admin = createAdminSupabaseClient();
  const regs = await admin.from("event_registrations").select("id").eq("user_id", userId).order("created_at", { ascending: false });
  if (regs.error) throw new Error(regs.error.message);
  const ids = ((regs.data ?? []) as { id: string }[]).map((row) => row.id);
  if (ids.length === 0) return null;
  const guests = await admin.from("event_guests").select("token, email, unsubscribed_at, event_id, registration_id").in("registration_id", ids);
  if (guests.error) throw new Error(guests.error.message);
  const byReg = new Map(((guests.data ?? []) as (GuestRow & { registration_id: string })[]).map((row) => [row.registration_id, row]));
  for (const id of ids) {
    const guest = byReg.get(id);
    if (guest) return guest;
  }
  return null;
}

/**
 * One mail per frozen event guest with an email, then the stamp.
 * The stamp goes first, so two runs never send twice. An unsubscribed guest
 * or an account without an email is stamped without a mail.
 */
export async function sendFreezeMails(origin: string): Promise<number> {
  if (!mailConfigured()) return 0;
  const admin = createAdminSupabaseClient();
  const due = await admin
    .from("profiles")
    .select("id")
    .eq("event_trial", true)
    .is("registered_at", null)
    .is("freeze_mail_sent_at", null)
    .lte("draft_expires_at", new Date().toISOString())
    .order("draft_expires_at")
    .limit(BATCH);
  if (due.error) {
    if (/event_trial|freeze_mail_sent_at/i.test(due.error.message)) return 0;
    throw new Error(due.error.message);
  }

  let sent = 0;
  for (const row of (due.data ?? []) as { id: string }[]) {
    try {
      const stamped = await admin
        .from("profiles")
        .update({ freeze_mail_sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("freeze_mail_sent_at", null)
        .select("id");
      if (stamped.error) throw new Error(stamped.error.message);
      if ((stamped.data ?? []).length === 0) continue;

      const user = await admin.auth.admin.getUserById(row.id);
      const email = user.data.user?.email?.trim().toLowerCase();
      if (!email) continue;
      const guest = await latestGuest(row.id);
      if (!guest || guest.unsubscribed_at) continue;
      const event = await readEvent(guest.event_id);
      if (!event) continue;
      const link = `${origin}/e/${encodeURIComponent(event.slug?.trim() || event.code)}?g=${guest.token}`;
      await sendFreezeNotice(email, event.name, link);
      sent += 1;
    } catch (error) {
      console.error("[purge] freeze mail", row.id, error);
    }
  }
  return sent;
}
