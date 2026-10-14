import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventHappeningFor } from "@/shared/services/event-now";

export type SaveConnectionResult = { ok: true } | { ok: false; own: boolean; message: string };

/**
 * One card into one book. A row already there stays as it is.
 * Saved while the book's owner is at an event, the row carries that event.
 */
export async function saveConnection(input: {
  ownerId: string;
  cardId: string;
}): Promise<SaveConnectionResult> {
  let sourceEventId: string | null = null;
  try {
    sourceEventId = await eventHappeningFor(input.ownerId);
  } catch (error) {
    console.error("[connections] event now", error);
  }
  const admin = createAdminSupabaseClient();
  const saved = await admin.from("connections").upsert(
    {
      owner_id: input.ownerId,
      saved_card_id: input.cardId,
      state: "active",
      ...(sourceEventId ? { source_event_id: sourceEventId } : {}),
    },
    { onConflict: "owner_id,saved_card_id", ignoreDuplicates: true },
  );
  if (!saved.error) return { ok: true };
  return { ok: false, own: /cannot_save_own_card/i.test(saved.error.message), message: saved.error.message };
}
