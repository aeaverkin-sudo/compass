import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventHappeningFor } from "@/shared/services/event-now";

export type SaveConnectionResult = { ok: true } | { ok: false; own: boolean; message: string };

type Failure = { message: string; code?: string };

/**
 * One card into one book. The first save inserts the row.
 * A later save turns a request into an ordinary contact, and leaves an ordinary contact as it is.
 * A request never turns an ordinary contact back into a request.
 * Saved while the book's owner is at an event, a new row carries that event.
 */
export async function saveConnection(input: {
  ownerId: string;
  cardId: string;
  /** A card the person saved themselves stays active. Share-back passes pending. */
  state?: "active" | "pending";
}): Promise<SaveConnectionResult> {
  const wanted = input.state === "pending" ? "pending" : "active";
  const admin = createAdminSupabaseClient();
  const first = await place(admin, input, wanted);
  if (first !== "again") return first;
  const second = await place(admin, input, wanted);
  if (second !== "again") return second;
  const existing = await admin
    .from("connections")
    .select("state")
    .eq("owner_id", input.ownerId)
    .eq("saved_card_id", input.cardId)
    .maybeSingle();
  if (existing.error) return failed(existing.error);
  if (!existing.data) return { ok: true };
  return promote(admin, input, existing.data.state, wanted);
}

/** Insert when the pair is new. On a collision, read the row that won and apply the same state rule. */
async function place(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  input: { ownerId: string; cardId: string },
  wanted: "active" | "pending",
): Promise<SaveConnectionResult | "again"> {
  const existing = await admin
    .from("connections")
    .select("state")
    .eq("owner_id", input.ownerId)
    .eq("saved_card_id", input.cardId)
    .maybeSingle();
  if (existing.error) return failed(existing.error);
  if (existing.data) return promote(admin, input, existing.data.state, wanted);

  let sourceEventId: string | null = null;
  try {
    sourceEventId = await eventHappeningFor(input.ownerId);
  } catch (error) {
    console.error("[connections] event now", error);
  }
  const inserted = await admin.from("connections").insert({
    owner_id: input.ownerId,
    saved_card_id: input.cardId,
    state: wanted,
    ...(sourceEventId ? { source_event_id: sourceEventId } : {}),
  });
  if (!inserted.error) return { ok: true };
  if (inserted.error.code === "23505") return "again";
  return failed(inserted.error);
}

/** Pending becomes active. Active stays active. Pending stays pending. Nothing else is written. */
async function promote(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  input: { ownerId: string; cardId: string },
  state: string | null,
  wanted: "active" | "pending",
): Promise<SaveConnectionResult> {
  if (state !== "pending" || wanted !== "active") return { ok: true };
  const updated = await admin
    .from("connections")
    .update({ state: "active" })
    .eq("owner_id", input.ownerId)
    .eq("saved_card_id", input.cardId);
  if (updated.error) return failed(updated.error);
  return { ok: true };
}

function failed(error: Failure): SaveConnectionResult {
  return { ok: false, own: /cannot_save_own_card/i.test(error.message), message: error.message };
}
