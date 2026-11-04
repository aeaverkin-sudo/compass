import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { primaryCardId } from "@/shared/services/primary-card";

export type ReverseShare = "none" | "pending" | "active";

/** Whether that person already holds my primary card, and whether it is still a request. */
export async function reverseShareFor(viewerId: string, theirOwnerId: string): Promise<ReverseShare> {
  const mine = await primaryCardId(viewerId);
  if (!mine || !theirOwnerId) return "none";
  const admin = createAdminSupabaseClient();
  const row = await admin
    .from("connections")
    .select("state")
    .eq("owner_id", theirOwnerId)
    .eq("saved_card_id", mine)
    .maybeSingle();
  if (row.error || !row.data) return "none";
  return row.data.state === "pending" ? "pending" : "active";
}
