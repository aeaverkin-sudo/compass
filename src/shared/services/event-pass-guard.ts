import { createHash } from "node:crypto";
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
