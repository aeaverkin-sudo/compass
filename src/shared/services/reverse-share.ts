import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

export type ReverseShare = "none" | "pending" | "active";

/** Whether that person already holds any of my cards. An ordinary contact wins over a request. */
export async function reverseShareFor(viewerId: string, theirOwnerId: string): Promise<ReverseShare> {
  if (!viewerId || !theirOwnerId) return "none";
  const admin = createAdminSupabaseClient();
  const mine = await admin.from("cards").select("id").eq("owner_id", viewerId);
  if (mine.error) return "none";
  const mineIds = ((mine.data ?? []) as { id: string }[]).map((card) => card.id);
  if (mineIds.length === 0) return "none";
  const held = await admin
    .from("connections")
    .select("state")
    .eq("owner_id", theirOwnerId)
    .in("saved_card_id", mineIds);
  if (held.error || !held.data?.length) return "none";
  let pending = false;
  for (const row of held.data) {
    if (row.state !== "pending") return "active";
    pending = true;
  }
  return pending ? "pending" : "none";
}
