import "server-only";

import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventHappeningFor } from "@/shared/services/event-now";

/** `#websummit` from the event this person is at. Empty when they are not at one. */
export async function suggestedEventTag(ownerId: string): Promise<string> {
  try {
    const eventId = await eventHappeningFor(ownerId);
    if (!eventId) return "";
    const admin = createAdminSupabaseClient();
    const loaded = await admin.from("events").select("name").eq("id", eventId).maybeSingle();
    if (loaded.error || !loaded.data) return "";
    const name = typeof loaded.data.name === "string" ? loaded.data.name : "";
    return hashtag(name);
  } catch (error) {
    console.error("[external-contacts] event", error instanceof Error ? error.message : error);
    return "";
  }
}

function hashtag(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!slug) return "";
  return `#${slug}`.slice(0, 80);
}
