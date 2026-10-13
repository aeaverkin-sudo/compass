import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventListStatus } from "@/shared/services/events";
import type { EventPassCard, EventPassStatus } from "@/shared/services/trial";

const HOUR_MS = 60 * 60 * 1000;

type EventRow = { id: string; name: string; date: string | null; ends_at?: string | null };

async function readEvents(ids: string[]): Promise<EventRow[]> {
  if (ids.length === 0) return [];
  const admin = createAdminSupabaseClient();
  const full = await admin.from("events").select("id, name, date, ends_at").in("id", ids);
  if (!full.error) return (full.data ?? []) as EventRow[];
  if (!/ends_at/i.test(full.error.message)) throw new Error(full.error.message);
  const kept = await admin.from("events").select("id, name, date").in("id", ids);
  if (kept.error) throw new Error(kept.error.message);
  return (kept.data ?? []) as EventRow[];
}

/** The event cards of an unkept guest account. Anyone else, or a database without the column, gets null. */
export async function readEventPass(
  userId: string,
  mail: { keepByTap: boolean; email: string | null; pendingEmail: string | null },
  now = Date.now(),
): Promise<EventPassStatus | null> {
  const admin = createAdminSupabaseClient();
  const profile = await admin.from("profiles").select("event_trial, registered_at, draft_expires_at, purge_at").eq("id", userId).maybeSingle();
  if (profile.error || !profile.data) return null;
  const row = profile.data as {
    event_trial: boolean | null;
    registered_at: string | null;
    draft_expires_at: string | null;
    purge_at: string | null;
  };
  if (row.event_trial !== true || row.registered_at) return null;

  const regs = await admin
    .from("event_registrations")
    .select("event_id, card_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (regs.error) throw new Error(regs.error.message);
  const list = (regs.data ?? []) as { event_id: string; card_id: string }[];
  const events = new Map((await readEvents([...new Set(list.map((reg) => reg.event_id))])).map((event) => [event.id, event]));
  const passes: EventPassCard[] = list.flatMap((reg) => {
    const event = events.get(reg.event_id);
    if (!event) return [];
    return [{ cardId: reg.card_id, eventName: event.name, ended: eventListStatus(event.date, now, event.ends_at ?? null) === "past" }];
  });

  const draft = row.draft_expires_at ? new Date(row.draft_expires_at).getTime() : Number.NaN;
  const purge = row.purge_at ? new Date(row.purge_at).getTime() : Number.NaN;
  const frozen = Number.isFinite(draft) && draft <= now;
  const frozenHoursLeft = frozen && Number.isFinite(purge) ? Math.max(1, Math.ceil((purge - now) / HOUR_MS)) : null;
  return {
    passes,
    frozenHoursLeft,
    keepByTap: mail.keepByTap,
    needsEmail: !mail.email && !mail.pendingEmail,
    pendingEmail: mail.email ? null : mail.pendingEmail,
  };
}
