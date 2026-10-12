import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { deleteAttachment, loadAttachment, removeStoredObject } from "@/shared/services/attachment-api";

/**
 * Removes one portfolio. Links, saves in other people's networks and event badges go with it (on delete cascade).
 * The library is untouched. The first portfolio is reset on the device, never deleted here.
 */
export async function deleteOwnCard(ownerId: string, cardId: string): Promise<"ok" | "missing" | "last"> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("cards")
    .select("id, photo_attachment_id")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; photo_attachment_id: string | null }[];
  const target = rows.find((row) => row.id === cardId);
  if (!target) return "missing";
  if (rows.length <= 1) return "last";

  const removed = await admin.from("cards").delete().eq("id", cardId).eq("owner_id", ownerId);
  if (removed.error) throw new Error(removed.error.message);

  // Insert/update triggers keep one portfolio public and primary. A delete does not fire them.
  const keeper = rows.find((row) => row.id !== cardId);
  if (keeper) {
    const touched = await admin.from("cards").update({ updated_at: new Date().toISOString() }).eq("id", keeper.id);
    if (touched.error) console.error("[cards] keep public", touched.error.message);
  }

  const photoId = target.photo_attachment_id;
  if (photoId && !rows.some((row) => row.id !== cardId && row.photo_attachment_id === photoId)) {
    const attachment = await loadAttachment(photoId);
    if (attachment && attachment.owner_id === ownerId) {
      await removeStoredObject(attachment.storage_path, attachment.bucket);
      await deleteAttachment(photoId, ownerId);
    }
  }
  return "ok";
}
