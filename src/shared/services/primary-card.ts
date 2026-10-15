import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

/** Exactly one primary card per owner: the others lose the flag first. */
export async function setPrimaryCard(ownerId: string, cardId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const owned = await admin.from("cards").select("id").eq("id", cardId).eq("owner_id", ownerId).maybeSingle();
  if (owned.error) throw new Error(owned.error.message);
  if (!owned.data) return false;
  const cleared = await admin.from("cards").update({ is_primary: false }).eq("owner_id", ownerId).neq("id", cardId).eq("is_primary", true);
  if (cleared.error) throw new Error(cleared.error.message);
  const set = await admin.from("cards").update({ is_primary: true }).eq("id", cardId).eq("owner_id", ownerId);
  if (set.error) throw new Error(set.error.message);
  return true;
}

/** The primary card, else the first one created. */
export async function primaryCardId(ownerId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.from("cards").select("id, is_primary").eq("owner_id", ownerId).order("created_at", { ascending: true });
  if (loaded.error) {
    const plain = await admin.from("cards").select("id").eq("owner_id", ownerId).order("created_at", { ascending: true }).limit(1);
    return ((plain.data ?? []) as { id: string }[])[0]?.id ?? null;
  }
  const rows = (loaded.data ?? []) as { id: string; is_primary: boolean | null }[];
  return (rows.find((row) => row.is_primary) ?? rows[0])?.id ?? null;
}
