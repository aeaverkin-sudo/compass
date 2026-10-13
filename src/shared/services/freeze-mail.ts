import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { deletionDateLabel } from "@/shared/lib/deletion-date";
import { mailConfigured, sendHtmlMail } from "@/shared/services/mail";
import { deletionMail, logMail } from "@/shared/services/event-mails";
import { eventTitleLine } from "@/shared/event/event-title";
import { eventGuestEnd } from "@/shared/services/trial";
import { loadEventTimeZone } from "@/shared/services/event-time-zone";
import { isTimeZone } from "@/shared/event/time-zone";

const BATCH = 50;
const NOTICE_MS = 48 * 60 * 60 * 1000;

type RegRow = { id: string; event_id: string };
type GuestRow = { id: string; token: string; registration_id: string; bounced_at?: string | null };
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
async function mailTarget(
  userId: string,
  origin: string,
): Promise<{ event: EventRow; link: string; guestId: string | null; bounced: boolean } | null> {
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

  const regIds = ordered.map((entry) => entry.row.id);
  const read = (columns: string) => admin.from("event_guests").select(columns).in("registration_id", regIds);
  let guests = await read("id, token, registration_id, bounced_at");
  if (guests.error && /bounced_at/i.test(guests.error.message)) guests = await read("id, token, registration_id");
  const byReg = new Map(((guests.error ? [] : guests.data ?? []) as unknown as GuestRow[]).map((guest) => [guest.registration_id, guest]));
  const own = byReg.get(latest.row.id);
  const any = own ?? ordered.map((entry) => byReg.get(entry.row.id)).find(Boolean);
  const linkEvent = any ? ordered.find((entry) => entry.row.id === any.registration_id)?.event ?? latest.event : latest.event;
  const link = any
    ? `${origin}/e/${encodeURIComponent(linkEvent.slug?.trim() || linkEvent.code)}?g=${any.token}`
    : `${origin}/main`;
  return { event: latest.event, link, guestId: own?.id ?? null, bounced: Boolean(own?.bounced_at ?? any?.bounced_at) };
}

/** Contacts this guest saved while at the event. */
async function metAt(userId: string, eventId: string): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("source_event_id", eventId);
  if (error) return 0;
  return count ?? 0;
}

/**
 * One mail per event guest with an email who met people at the event, 48 hours before
 * the deletion. The stamp goes first, so two runs never send twice. Nobody met, no email
 * or a bounce: stamped without a mail. Unsubscribing does not stop it: it is about the data.
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
      if (!target || target.bounced) continue;
      const met = await metAt(row.id, target.event.id);
      if (met === 0) continue;
      const eventZone = await loadEventTimeZone(target.event.id);
      const deviceZone = account?.user_metadata?.time_zone;
      const expires = deletionDateLabel(row.purge_at, isTimeZone(deviceZone) ? deviceZone : eventZone);
      const eventName = eventTitleLine(target.event.name);
      const body = deletionMail({ eventName, met, expires, link: target.link });
      const providerId = await sendHtmlMail({ to: email, subject: `Your card from ${eventName}`, html: body.html, text: body.text });
      await logMail(target.event.id, "deletion", target.guestId, providerId);
      sent += 1;
    } catch (error) {
      console.error("[purge] freeze mail", row.id, error);
    }
  }
  return sent;
}
