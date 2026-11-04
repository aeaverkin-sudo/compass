import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { HANDLE_RE } from "@/shared/services/card-handle";
import { saveConnection } from "@/shared/services/save-connection";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export type ScanOutcome = "new" | "existing" | "own";

type CardFace = { id: string; owner_id: string; display_name: string | null };

/** Save a scanned card and say whether the row is new. An existing row keeps its date. */
export async function saveScannedCard(
  userId: string,
  lookup: { token?: string; handle?: string },
): Promise<{ outcome: ScanOutcome; name: string } | null> {
  const token = lookup.token && TOKEN_RE.test(lookup.token) ? lookup.token : "";
  const handle = lookup.handle && HANDLE_RE.test(lookup.handle.toLowerCase()) ? lookup.handle.toLowerCase() : "";
  if (!token && !handle) return null;

  const admin = createAdminSupabaseClient();
  const query = admin.from("cards").select("id, owner_id, display_name");
  const found = token
    ? await query.eq("public_token", token).maybeSingle()
    : await query.eq("handle", handle).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  const card = found.data as CardFace | null;
  if (!card) return null;

  const name = card.display_name?.trim() || "Untitled";
  if (card.owner_id === userId) return { outcome: "own", name };

  const prior = await admin
    .from("connections")
    .select("id")
    .eq("owner_id", userId)
    .eq("saved_card_id", card.id)
    .maybeSingle();
  if (prior.error) throw new Error(prior.error.message);
  if (prior.data) return { outcome: "existing", name };

  const saved = await saveConnection({ ownerId: userId, cardId: card.id });
  if (!saved.ok) {
    if (saved.own) return { outcome: "own", name };
    throw new Error(saved.message);
  }
  return { outcome: "new", name };
}
