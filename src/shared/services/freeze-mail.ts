import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { deletionDateLabel } from "@/shared/lib/deletion-date";
import { mailConfigured, sendFreezeNotice } from "@/shared/services/mail";
import { eventGuestEnd } from "@/shared/services/trial";

const BATCH = 50;
const NOTICE_MS = 48 * 60 * 60 * 1000;

type RegRow = { id: string; event_id: string };
type GuestRow = { token: string; unsubscribed_at: string | null; registration_id: string };
type EventRow = { id: string; name: string; code: string; slug?: string | null; date: string | null; ends_at?: string | null };

async function readEvents(ids: string[]): Promise<EventRow[]> {
  if (ids.length === 0) return [];
  const admin = createAdminSupabaseClient();
  const columns = ["id", "name", "code", "date", "slug", "ends_at"];
  for (;;) {
    const loaded = await admin.from("events").select(columns.join(", ")).in("id", ids);
    if (!loaded.error) return (loaded.data ?? []) as unknown as EventRow[];
    const missing = ["slug", "ends_at"].find((column) => columns.includes(column) && new RegExp(column, "i").test(loaded.error.message));
    if (!missing) throw new Error(loaded.error.message);
    columns.splice(columns.indexOf(missing), 1);
  }
}

/**
 * The event that set the deletion date (the latest end), and the personal link that opens the pass.
 * A guest who came by the open link has no personal link; the pass opens on the same device.
 */
async function mailTarget(userId: string, origin: string): Promise<{ event: EventRow; link: string; unsubscribed: boolean } | null> {
  const admin = createAdminSupabaseClient();
  const regs = await admin.from("event_registrations").select("id, event_id").eq("user_id", userId);
  if (regs.error) throw new Error(regs.error.message);
  const rows = (regs.data ?? []) as RegRow[];
  if (rows.length === 0) return null;
  const events = new Map((await readEvents([...new Set(rows.map((row) => row.event_id))])).map((event) => [event.id, event]));
  const ordered = rows
    .flatMap((row) => {
      const event = events.get(row.event_id);
      return event ? [{ row, event, end: eventGuestEnd({ date: event.date, endsAt: event.ends_at ?? null }) }] : [];
    })
    .sort((left, right) => right.end - left.end);
  const latest = ordered[0];
  if (!latest) return null;

  const guests = await admin
    .from("event_guests")
    .select("token, unsubscribed_at, registration_id")
    .in(
      "registration_id",
      ordered.map((entry) => entry.row.id),
    );
  const byReg = new Map(((guests.error ? [] : guests.data ?? []) as GuestRow[]).map((guest) => [guest.registration_id, guest]));
  const own = byReg.get(latest.row.id);
  const any = own ?? ordered.map((entry) => byReg.get(entry.row.id)).find(Boolean);
  const linkEvent = any ? ordered.find((entry) => entry.row.id === any.registration_id)?.event ?? latest.event : latest.event;
  const link = any
    ? `${origin}/e/${encodeURIComponent(linkEvent.slug?.trim() || linkEvent.code)}?g=${any.token}`
    : `${origin}/main`;
  return { event: latest.event, link, unsubscribed: Boolean(own?.unsubscribed_at ?? any?.unsubscribed_at) };
}

/**
 * One mail per event guest with an email, 48 hours before the deletion, then the stamp.
 * The stamp goes first, so two runs never send twice. An unsubscribed guest
 * or an account without an email is stamped without a mail.
 */
export async function sendFreezeMails(origin: string): Promise<number> {
  if (!mailConfigured()) return 0;
  const admin = createAdminSupabaseClient();
  const now = Date.now();
  const due = await admin
    .from("profiles")
    .select("id, purge_at")
    .eq("event_trial", true)
    .is("registered_at", null)
    .is("freeze_mail_sent_at", null)
    .lte("purge_at", new Date(now + NOTICE_MS).toISOString())
    .gt("purge_at", new Date(now).toISOString())
    .order("purge_at")
    .limit(BATCH);
  if (due.error) {
    if (/event_trial|freeze_mail_sent_at/i.test(due.error.message)) return 0;
    throw new Error(due.error.message);
  }

  let sent = 0;
  for (const row of (due.data ?? []) as { id: string; purge_at: string }[]) {
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
      const account = user.data.user;
      const email = account?.email_confirmed_at ? account.email?.trim().toLowerCase() : null;
      if (!email) continue;
      const target = await mailTarget(row.id, origin);
      if (!target || target.unsubscribed) continue;
      const zone = typeof account?.user_metadata?.time_zone === "string" ? account.user_metadata.time_zone : "UTC";
      let deleteOn: string;
      try {
        deleteOn = deletionDateLabel(row.purge_at, zone);
      } catch {
        deleteOn = deletionDateLabel(row.purge_at, "UTC");
      }
      await sendFreezeNotice(email, target.event.name, deleteOn, target.link);
      sent += 1;
    } catch (error) {
      console.error("[purge] freeze mail", row.id, error);
    }
  }
  return sent;
}
