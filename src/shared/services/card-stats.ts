import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isUuid } from "@/shared/services/attachment-api";

type CardRow = {
  id: string;
  created_at: string;
  is_primary?: boolean | null;
};

export type CardData = {
  shared: number;
  opens: number;
  saved: number;
};

async function ownerCards(ownerId: string): Promise<CardRow[]> {
  const admin = createAdminSupabaseClient();
  const withPrimary = await admin.from("cards").select("id, is_primary, created_at").eq("owner_id", ownerId);
  if (!withPrimary.error) return (withPrimary.data ?? []) as CardRow[];
  if (!/is_primary/i.test(withPrimary.error.message)) throw new Error(withPrimary.error.message);

  const plain = await admin.from("cards").select("id, created_at").eq("owner_id", ownerId);
  if (plain.error) throw new Error(plain.error.message);
  return (plain.data ?? []) as CardRow[];
}

function pickCard(rows: CardRow[], requested: string | null) {
  if (requested && isUuid(requested)) {
    const owned = rows.find((row) => row.id === requested);
    if (owned) return owned.id;
  }
  const primary = rows.find((row) => row.is_primary);
  if (primary) return primary.id;
  return rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.id ?? null;
}

async function countEvents(cardId: string, type: string, via?: string) {
  const admin = createAdminSupabaseClient();
  let query = admin.from("card_events").select("id", { count: "exact", head: true }).eq("card_id", cardId).eq("type", type);
  if (via) query = query.eq("via", via);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Shared is a sent share plus a scan of the on-screen QR. Opens is every visit. Saved is the person, not the card. */
export async function readCardData(ownerId: string, requestedCardId: string | null): Promise<CardData> {
  const admin = createAdminSupabaseClient();
  const savedCall = await admin.rpc("connection_save_count", { subject: ownerId });
  if (savedCall.error) throw new Error(savedCall.error.message);
  const saved = Number(savedCall.data ?? 0);

  const cardId = pickCard(await ownerCards(ownerId), requestedCardId);
  if (!cardId) return { shared: 0, opens: 0, saved };

  const [opens, shares, scans] = await Promise.all([
    countEvents(cardId, "card_open"),
    countEvents(cardId, "share"),
    countEvents(cardId, "card_open", "qr"),
  ]);
  return { shared: shares + scans, opens, saved };
}

/** The owner tapped Share and the link or file actually left. A cancelled sheet does not count. */
export async function recordCardShare(ownerId: string, cardId: string): Promise<boolean> {
  if (!isUuid(cardId)) return false;
  const admin = createAdminSupabaseClient();
  const owned = await admin.from("cards").select("id").eq("id", cardId).eq("owner_id", ownerId).maybeSingle();
  if (owned.error) throw new Error(owned.error.message);
  if (!owned.data) return false;
  const { error } = await admin.from("card_events").insert({ card_id: cardId, type: "share" });
  if (error) throw new Error(error.message);
  return true;
}
