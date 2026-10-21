import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventListStatus } from "@/shared/services/events";
import { eventGuestEnd, type EventPassCard, type EventPassStatus } from "@/shared/services/trial";

type EventRow = { id: string; name: string; date: string | null; ends_at?: string | null; is_paid?: boolean | null };
type RegRow = { event_id: string; card_id: string; paid_status?: string | null; paid_source?: string | null };

function missingOf(message: string, extras: string[]): string | undefined {
  return extras.find((column) => new RegExp(column, "i").test(message));
}

/** A missing optional column drops out of the query. */
async function readRegistrations(userId: string): Promise<RegRow[]> {
  const admin = createAdminSupabaseClient();
  const extras = ["paid_status", "paid_source"];
  for (;;) {
    const loaded = await admin.from("event_registrations").select(["event_id", "card_id", ...extras].join(", ")).eq("user_id", userId);
    if (!loaded.error) return (loaded.data ?? []) as unknown as RegRow[];
    const missing = missingOf(loaded.error.message, extras);
    if (!missing) throw new Error(loaded.error.message);
    extras.splice(extras.indexOf(missing), 1);
  }
}

async function readEvents(ids: string[]): Promise<EventRow[]> {
  if (ids.length === 0) return [];
  const admin = createAdminSupabaseClient();
  const extras = ["ends_at", "is_paid"];
  for (;;) {
    const loaded = await admin.from("events").select(["id", "name", "date", ...extras].join(", ")).in("id", ids);
    if (!loaded.error) return (loaded.data ?? []) as unknown as EventRow[];
    const missing = missingOf(loaded.error.message, extras);
    if (!missing) throw new Error(loaded.error.message);
    extras.splice(extras.indexOf(missing), 1);
  }
}

const CONFIRMED_SOURCES = new Set(["statement", "name", "manual", "list"]);

/** The event cards of an unkept guest account. Anyone else, or a database without the column, gets null. */
export async function readEventPass(
  userId: string,
  mail: { keepByTap: boolean; email: string | null; pendingEmail: string | null },
  now = Date.now(),
): Promise<EventPassStatus | null> {
  const admin = createAdminSupabaseClient();
  const profile = await admin.from("profiles").select("event_trial, registered_at, purge_at").eq("id", userId).maybeSingle();
  if (profile.error || !profile.data) return null;
  const row = profile.data as {
    event_trial: boolean | null;
    registered_at: string | null;
    purge_at: string | null;
  };
  if (row.event_trial !== true || row.registered_at) return null;

  const list = await readRegistrations(userId);
  const events = new Map((await readEvents([...new Set(list.map((reg) => reg.event_id))])).map((event) => [event.id, event]));
  const byCard = new Map<string, { name: string; end: number; ended: boolean; payPending: boolean }[]>();
  for (const reg of list) {
    const event = events.get(reg.event_id);
    if (!event) continue;
    const end = eventGuestEnd({ date: event.date, endsAt: event.ends_at ?? null }, now);
    const ended = eventListStatus(event.date, now, event.ends_at ?? null) === "past";
    const confirmed = reg.paid_status === "paid" && CONFIRMED_SOURCES.has(reg.paid_source ?? "");
    const payPending = event.is_paid === true && !confirmed;
    byCard.set(reg.card_id, [...(byCard.get(reg.card_id) ?? []), { name: event.name, end, ended, payPending }]);
  }
  /** One card for every event: it names the nearest one ahead, and is over once all of them are. */
  const passes: EventPassCard[] = [...byCard].map(([cardId, rows]) => {
    const ahead = rows.filter((row) => !row.ended).sort((left, right) => left.end - right.end);
    const pick = ahead[0] ?? [...rows].sort((left, right) => right.end - left.end)[0];
    return { cardId, eventName: pick.name, ended: ahead.length === 0, payPending: pick.payPending };
  });

  const purge = row.purge_at ? new Date(row.purge_at).getTime() : Number.NaN;
  return {
    passes,
    deleteAt: Number.isFinite(purge) ? new Date(purge).toISOString() : null,
    keepByTap: mail.keepByTap,
    needsEmail: !mail.email && !mail.pendingEmail,
    pendingEmail: mail.email ? null : mail.pendingEmail,
  };
}
