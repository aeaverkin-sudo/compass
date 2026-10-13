import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

export type EventSeats = {
  /** Null: no limit. */
  capacity: number | null;
  /** Every registration, whatever the source: lists, the open link, members. */
  going: number;
  left: number | null;
  soldOut: boolean;
};

async function readCapacity(eventId: string): Promise<number | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("events").select("capacity").eq("id", eventId).maybeSingle();
  if (error) {
    if (/capacity/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  const value = (data as { capacity?: number | null } | null)?.capacity;
  return typeof value === "number" && value > 0 ? value : null;
}

export async function loadEventSeats(eventId: string): Promise<EventSeats> {
  const capacity = await readCapacity(eventId);
  if (capacity == null) return { capacity: null, going: 0, left: null, soldOut: false };
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  const going = count ?? 0;
  return { capacity, going, left: Math.max(0, capacity - going), soldOut: going >= capacity };
}

export const SOLD_OUT = "Sold out";
