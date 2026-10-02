import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isUuid } from "@/shared/services/attachment-api";
import { linkDisplay } from "@/shared/services/link-display";
import type { ContactItem, ContactType } from "@/shared/types";

type CardRow = {
  id: string;
  created_at: string;
  is_primary?: boolean | null;
};

export type LinkOpen = {
  label: string;
  count: number;
};

export type CardData = {
  shared: number;
  /** Distinct viewers. Bots and the owner are already left out of the rows. */
  opens: number;
  totalOpens: number;
  opensViaQr: number;
  saved: number;
  linkOpens: LinkOpen[];
  repeatVisits: number;
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

async function countEvents(cardId: string, types: string[]) {
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("card_events")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId)
    .in("type", types);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function uniqueOpens(cardId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("card_unique_opens", { card: cardId });
  if (error) {
    console.error("[network] unique opens", error.message);
    return null;
  }
  return Number(data ?? 0);
}

async function repeatVisits(cardId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("card_repeat_visits", { card: cardId });
  if (error) {
    console.error("[network] repeat", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

async function linkOpens(cardId: string): Promise<LinkOpen[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("card_link_opens", { card: cardId });
  if (error) {
    console.error("[network] link opens", error.message);
    return [];
  }
  const rows = (data ?? []) as { item_id: string; opens: number }[];
  const ids = rows.map((row) => row.item_id).filter((id) => isUuid(id));
  if (ids.length === 0) return [];

  const items = await admin.from("items").select("id, type, label, value, url").in("id", ids);
  if (items.error) throw new Error(items.error.message);
  const byId = new Map((items.data ?? []).map((row) => [row.id as string, row]));

  return rows
    .map((row) => {
      const item = byId.get(row.item_id);
      const label = item
        ? linkDisplay({
            id: item.id as string,
            type: item.type as ContactType,
            label: (item.label as string | null) ?? "",
            value: (item.value as string | null) ?? "",
            url: (item.url as string | null) ?? "",
            order: 0,
          } satisfies ContactItem)
        : "Link";
      return { label: label.trim() || "Link", count: Number(row.opens ?? 0) };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Shared is a sent share. Opens is distinct viewers. Total opens is every counted visit. Saved is the person, not the card. */
export async function readCardData(ownerId: string, requestedCardId: string | null): Promise<CardData> {
  const admin = createAdminSupabaseClient();
  const savedCall = await admin.rpc("connection_save_count", { subject: ownerId });
  if (savedCall.error) throw new Error(savedCall.error.message);
  const saved = Number(savedCall.data ?? 0);

  const empty = {
    shared: 0,
    opens: 0,
    totalOpens: 0,
    opensViaQr: 0,
    saved,
    linkOpens: [],
    repeatVisits: 0,
  };
  const cardId = pickCard(await ownerCards(ownerId), requestedCardId);
  if (!cardId) return empty;

  const [shared, totalOpens, opensViaQr, unique, links, repeats] = await Promise.all([
    countEvents(cardId, ["share"]),
    countEvents(cardId, ["card_open", "qr_open"]),
    countEvents(cardId, ["qr_open"]),
    uniqueOpens(cardId),
    linkOpens(cardId),
    repeatVisits(cardId),
  ]);
  return {
    shared,
    opens: unique ?? totalOpens,
    totalOpens,
    opensViaQr,
    saved,
    linkOpens: links,
    repeatVisits: repeats,
  };
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
