import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventGuestEnd } from "@/shared/services/trial";

const HOUR_MS = 60 * 60 * 1000;
/** A contact counts as met at the event from an hour before the start to three hours after the end. */
const BEFORE_MS = HOUR_MS;
const AFTER_MS = 3 * HOUR_MS;

type EventRow = { id: string; date: string | null; ends_at?: string | null };

/**
 * The event this person is at right now: a registration whose event runs from the start − 1h
 * to the end + 3h. Two at once: the one whose start is nearest. None: null.
 */
export async function eventHappeningFor(userId: string, now = Date.now()): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const regs = await admin.from("event_registrations").select("event_id").eq("user_id", userId);
  if (regs.error) throw new Error(regs.error.message);
  const ids = [...new Set((regs.data ?? []).map((row) => row.event_id as string))];
  if (ids.length === 0) return null;

  const full = await admin.from("events").select("id, date, ends_at").in("id", ids);
  const loaded = full.error && /ends_at/i.test(full.error.message)
    ? await admin.from("events").select("id, date").in("id", ids)
    : full;
  if (loaded.error) throw new Error(loaded.error.message);

  let best: { id: string; gap: number } | null = null;
  for (const row of (loaded.data ?? []) as EventRow[]) {
    const start = row.date ? new Date(row.date).getTime() : Number.NaN;
    if (!Number.isFinite(start)) continue;
    const end = eventGuestEnd({ date: row.date, endsAt: row.ends_at ?? null });
    if (now < start - BEFORE_MS || now > end + AFTER_MS) continue;
    const gap = Math.abs(now - start);
    if (!best || gap < best.gap) best = { id: row.id, gap };
  }
  return best?.id ?? null;
}
