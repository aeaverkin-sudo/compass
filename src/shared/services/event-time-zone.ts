import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventTimeZone } from "@/shared/event/time-zone";

/** Each event's own zone. Before the column exists, or for an unknown id, the default zone. */
export async function loadEventTimeZones(eventIds: string[]): Promise<Map<string, string>> {
  const zones = new Map<string, string>();
  const ids = [...new Set(eventIds.filter(Boolean))];
  if (ids.length === 0) return zones;
  const admin = createAdminSupabaseClient();
  const loaded = await admin.from("events").select("id, time_zone").in("id", ids);
  for (const id of ids) zones.set(id, eventTimeZone(null));
  if (loaded.error) return zones;
  for (const row of (loaded.data ?? []) as { id: string; time_zone?: string | null }[]) {
    zones.set(row.id, eventTimeZone(row.time_zone));
  }
  return zones;
}

export async function loadEventTimeZone(eventId: string): Promise<string> {
  return (await loadEventTimeZones([eventId])).get(eventId) ?? eventTimeZone(null);
}
