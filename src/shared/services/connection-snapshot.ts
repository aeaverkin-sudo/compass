import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { asCardStatus } from "@/shared/lib/card-status";
import { normalizeItemZones, normalizeRubricLabels, normalizeRubricOrder } from "@/shared/services/card-zones";
import type { Card, ContactItem, ContactType } from "@/shared/types";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SNAPSHOT_COLUMNS = /snapshot|saved_card_deleted_at/i;

type SnapshotItem = { id: string; type: string; label: string; value: string; url: string; order: number };

/** The card's rows as they were at deletion: captions and values, no files, no photo. */
export type CardSnapshot = {
  v: 1;
  displayName: string;
  title: string;
  rubricOrder?: unknown;
  rubricLabels?: unknown;
  itemZones?: unknown;
  items: SnapshotItem[];
};

type CardRow = {
  id: string;
  display_name: string | null;
  title: string | null;
  rubric_order?: unknown;
  rubric_labels?: unknown;
  item_zones?: unknown;
};

function linkOnly(url: string | null): string {
  const trimmed = (url ?? "").trim();
  return /^(https?:|mailto:|tel:)/i.test(trimmed) ? trimmed : "";
}

async function ownerCards(userId: string): Promise<CardRow[]> {
  const admin = createAdminSupabaseClient();
  const full = await admin
    .from("cards")
    .select("id, display_name, title, rubric_order, rubric_labels, item_zones")
    .eq("owner_id", userId);
  if (!full.error) return (full.data ?? []) as CardRow[];
  const basic = await admin.from("cards").select("id, display_name, title").eq("owner_id", userId);
  if (basic.error) throw new Error(basic.error.message);
  return (basic.data ?? []) as CardRow[];
}

async function snapshotOf(card: CardRow): Promise<CardSnapshot> {
  const admin = createAdminSupabaseClient();
  const links = await admin
    .from("card_items")
    .select("item_id, sort_order")
    .eq("card_id", card.id)
    .eq("visible", true)
    .order("sort_order");
  if (links.error) throw new Error(links.error.message);
  const rows = (links.data ?? []) as { item_id: string; sort_order: number }[];
  const items: SnapshotItem[] = [];
  if (rows.length > 0) {
    const loaded = await admin
      .from("items")
      .select("id, type, label, value, url, attachment_id")
      .in(
        "id",
        rows.map((row) => row.item_id),
      );
    if (loaded.error) throw new Error(loaded.error.message);
    type ItemRow = { id: string; type: string; label: string | null; value: string | null; url: string | null; attachment_id: string | null };
    const byId = new Map(((loaded.data ?? []) as ItemRow[]).map((item) => [item.id, item]));
    for (const row of rows) {
      const item = byId.get(row.item_id);
      if (!item || item.attachment_id) continue;
      const value = (item.value ?? "").trim();
      if (!value || value.startsWith("data:")) continue;
      items.push({ id: item.id, type: item.type, label: item.label ?? "", value, url: linkOnly(item.url), order: row.sort_order });
    }
  }
  return {
    v: 1,
    displayName: card.display_name?.trim() ?? "",
    title: card.title?.trim() ?? "",
    rubricOrder: card.rubric_order ?? null,
    rubricLabels: card.rubric_labels ?? null,
    itemZones: card.item_zones ?? null,
    items,
  };
}

/**
 * Before an account goes: every book that saved one of its cards keeps that card's rows.
 * Until the SQL runs there is nowhere to keep them, and the deletion goes on as before.
 */
export async function keepSavedCardSnapshots(userId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const cards = await ownerCards(userId);
  if (cards.length === 0) return;
  const saved = await admin
    .from("connections")
    .select("saved_card_id")
    .in(
      "saved_card_id",
      cards.map((card) => card.id),
    );
  if (saved.error) throw new Error(saved.error.message);
  const savedIds = new Set((saved.data ?? []).map((row) => row.saved_card_id as string));
  const now = new Date().toISOString();
  for (const card of cards) {
    if (!savedIds.has(card.id)) continue;
    const snapshot = await snapshotOf(card);
    const kept = await admin
      .from("connections")
      .update({ snapshot, saved_card_deleted_at: now })
      .eq("saved_card_id", card.id);
    if (kept.error) {
      if (SNAPSHOT_COLUMNS.test(kept.error.message)) return;
      throw new Error(kept.error.message);
    }
  }
}

function readSnapshot(value: unknown): CardSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CardSnapshot>;
  if (raw.v !== 1 || !Array.isArray(raw.items)) return null;
  return {
    v: 1,
    displayName: typeof raw.displayName === "string" ? raw.displayName : "",
    title: typeof raw.title === "string" ? raw.title : "",
    rubricOrder: raw.rubricOrder,
    rubricLabels: raw.rubricLabels,
    itemZones: raw.itemZones,
    items: raw.items.filter(
      (item): item is SnapshotItem =>
        Boolean(item) && typeof item.id === "string" && typeof item.value === "string" && typeof item.type === "string",
    ),
  };
}

/** A deleted card as one book kept it. Read only, for that book's owner. */
export async function loadDeletedCard(
  viewerId: string,
  token: string,
): Promise<{ card: Card; items: ContactItem[] } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const admin = createAdminSupabaseClient();
  const loaded = await admin
    .from("connections")
    .select("id, display_name, snapshot, saved_card_deleted_at")
    .eq("owner_id", viewerId)
    .eq("saved_card_token", token)
    .not("saved_card_deleted_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (loaded.error || !loaded.data) return null;
  const row = loaded.data as { id: string; display_name: string; snapshot: unknown; saved_card_deleted_at: string };
  const snapshot = readSnapshot(row.snapshot);
  if (!snapshot) return null;
  const items: ContactItem[] = snapshot.items.map((item) => ({
    id: item.id,
    type: item.type as ContactType,
    label: item.label ?? "",
    value: item.value,
    url: item.url ?? "",
    order: typeof item.order === "number" ? item.order : 0,
  }));
  const card: Card = {
    id: row.id,
    displayName: snapshot.displayName || row.display_name,
    title: snapshot.title,
    status: asCardStatus("published"),
    publicToken: token,
    qrVersion: 1,
    contactItemIds: items.map((item) => item.id),
    rubricOrder: normalizeRubricOrder(snapshot.rubricOrder),
    rubricLabels: normalizeRubricLabels(snapshot.rubricLabels),
    itemZones: normalizeItemZones(snapshot.itemZones),
    nextScanAddons: [],
    createdAt: row.saved_card_deleted_at,
    updatedAt: row.saved_card_deleted_at,
  };
  return { card, items };
}
