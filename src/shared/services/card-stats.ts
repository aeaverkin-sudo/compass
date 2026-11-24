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
  /** Set when this portfolio's Data screen counts from a reset. History leaves it empty. */
  since?: string | null;
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
    return owned ? owned.id : null;
  }
  const primary = rows.find((row) => row.is_primary);
  if (primary) return primary.id;
  return rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.id ?? null;
}

async function countEvents(cardId: string, types: string[], since?: string) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("card_events")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId)
    .in("type", types);
  if (since) query = query.gte("created_at", since);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Account-wide, active rows only. A date counts those made at or after it. The count is not a row list. */
async function countSaved(ownerId: string, since?: string) {
  const admin = createAdminSupabaseClient();
  if (!since) {
    const savedCall = await admin.rpc("connection_save_count", { subject: ownerId });
    if (savedCall.error) throw new Error(savedCall.error.message);
    return Number(savedCall.data ?? 0);
  }
  const { count, error } = await admin
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("saved_owner_id", ownerId)
    .eq("state", "active")
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function uniqueOpens(cardId: string, since?: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = since
    ? await admin.rpc("card_unique_opens_since", { card: cardId, since })
    : await admin.rpc("card_unique_opens", { card: cardId });
  if (error) {
    if (since) throw new Error(error.message);
    console.error("[network] unique opens", error.message);
    return null;
  }
  return Number(data ?? 0);
}

async function repeatVisits(cardId: string, since?: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = since
    ? await admin.rpc("card_repeat_visits_since", { card: cardId, since })
    : await admin.rpc("card_repeat_visits", { card: cardId });
  if (error) {
    if (since) throw new Error(error.message);
    console.error("[network] repeat", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

async function linkOpens(cardId: string, since?: string): Promise<LinkOpen[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = since
    ? await admin.rpc("card_link_opens_since", { card: cardId, since })
    : await admin.rpc("card_link_opens", { card: cardId });
  if (error) {
    if (since) throw new Error(error.message);
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

function countedFrom(since?: string | null) {
  if (!since) return undefined;
  const time = Date.parse(since);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString();
}

/** Shared is a sent share. Opens is distinct viewers. Total opens is every counted visit. Saved is the person, not the card. */
export async function readCardData(
  ownerId: string,
  requestedCardId: string | null,
  since?: string | null,
): Promise<CardData> {
  const from = countedFrom(since);
  const saved = await countSaved(ownerId, from);

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
    countEvents(cardId, ["share"], from),
    countEvents(cardId, ["card_open", "qr_open"], from),
    countEvents(cardId, ["qr_open"], from),
    uniqueOpens(cardId, from),
    linkOpens(cardId, from),
    repeatVisits(cardId, from),
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

function missingResetTable(error: { code?: string; message?: string }) {
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = error.message ?? "";
  return /card_stats_resets/i.test(message) && /schema cache|does not exist|could not find/i.test(message);
}

/** The date this portfolio's Data screen counts from. No table and no row both mean all time. */
export async function cardStatsSince(ownerId: string, cardId: string): Promise<string | null> {
  if (!isUuid(cardId)) return null;
  const admin = createAdminSupabaseClient();
  const row = await admin
    .from("card_stats_resets")
    .select("reset_at")
    .eq("card_id", cardId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (row.error) {
    if (missingResetTable(row.error)) return null;
    throw new Error(row.error.message);
  }
  const resetAt = row.data?.reset_at;
  return typeof resetAt === "string" ? resetAt : null;
}

/** Remember now as the start of the count. Nothing already stored is removed. */
export async function resetCardStats(ownerId: string, cardId: string): Promise<(CardData & { since: string }) | null> {
  if (!isUuid(cardId)) return null;
  const owned = (await ownerCards(ownerId)).some((row) => row.id === cardId);
  if (!owned) return null;
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const written = await admin
    .from("card_stats_resets")
    .upsert({ card_id: cardId, owner_id: ownerId, reset_at: now }, { onConflict: "card_id" })
    .select("reset_at")
    .maybeSingle();
  if (written.error) {
    if (missingResetTable(written.error)) return null;
    throw new Error(written.error.message);
  }
  const since = typeof written.data?.reset_at === "string" ? written.data.reset_at : now;
  const data = await readCardData(ownerId, cardId, since);
  return { ...data, since };
}

/** Share counting is off. The sheet itself is unchanged. */
export async function recordCardShare(_ownerId: string, cardId: string): Promise<boolean> {
  return isUuid(cardId);
}
