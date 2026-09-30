import { cache } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { HANDLE_RE } from "@/shared/services/card-handle";
import type { Card, ContactItem, ContactType } from "@/shared/types";
import { asCardStatus } from "@/shared/lib/card-status";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { ownerTrialFrozen } from "@/shared/services/trial";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const CARD_PUBLIC_COLUMNS =
  "id, owner_id, display_name, title, status, public_token, is_public, photo_attachment_id, created_at, updated_at";

type CardRow = {
  id: string;
  owner_id: string;
  display_name: string;
  title: string | null;
  status: string;
  public_token: string;
  handle?: string | null;
  is_public: boolean;
  photo_attachment_id: string | null;
  created_at: string;
  updated_at: string;
};

type LinkRow = { item_id: string; sort_order: number };

type ItemRow = {
  id: string;
  type: string;
  label: string | null;
  value: string | null;
  url: string | null;
  attachment_id: string | null;
};

export type PublicCard = {
  card: Card;
  items: ContactItem[];
  ownerId: string;
  /** Past the 24h trial. The page and the PDF say the card is inactive. */
  inactive?: boolean;
};

/** Name, a ready stored photo, and is_public. Archived and suspended stay private. */
export function cardIsPubliclyServed(row: {
  is_public: boolean;
  status: string;
  display_name: string | null;
  photo_attachment_id: string | null;
}): boolean {
  if (!row.is_public) return false;
  if (row.status === "archived" || row.status === "suspended") return false;
  return Boolean(row.display_name?.trim() && row.photo_attachment_id);
}

function publicUrl(url: string | null, attachmentId: string | null, readyIds: Set<string>): string {
  const trimmed = (url ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return "";
  if (attachmentId && readyIds.has(attachmentId)) return `/f/${attachmentId}`;
  return "";
}

async function readyAttachmentIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("attachments").select("id, status").in("id", unique);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).filter((row) => row.status === "ready").map((row) => row.id as string));
}

/**
 * Public projection for /c/{token}. Service role only.
 * Omits owner id from the card itself; `ownerId` stays on the server to skip the owner's own card_open.
 */
async function selectPublicRow(column: "public_token" | "handle", value: string): Promise<CardRow | null> {
  const admin = createAdminSupabaseClient();
  const withHandle = await admin
    .from("cards")
    .select(`${CARD_PUBLIC_COLUMNS}, handle`)
    .eq(column, value)
    .maybeSingle();
  if (!withHandle.error) return withHandle.data as CardRow | null;
  if (!/handle/i.test(withHandle.error.message)) throw new Error(withHandle.error.message);
  const plain = await admin.from("cards").select(CARD_PUBLIC_COLUMNS).eq(column, value).maybeSingle();
  if (plain.error) {
    if (column === "handle" && /handle/i.test(plain.error.message)) return null;
    throw new Error(plain.error.message);
  }
  return plain.data as CardRow | null;
}

export const loadPublicCardByHandle = cache(async (handle: string): Promise<PublicCard | null> => {
  noStore();
  const key = decodeURIComponent(handle).trim().toLowerCase();
  if (!HANDLE_RE.test(key)) return null;
  const row = await selectPublicRow("handle", key);
  if (!row?.public_token) return null;
  return loadPublicCard(row.public_token);
});

export const loadPublicCard = cache(async (token: string): Promise<PublicCard | null> => {
  noStore();
  if (!TOKEN_RE.test(token)) return null;

  const row = await selectPublicRow("public_token", token);
  if (!row || !cardIsPubliclyServed(row) || !row.photo_attachment_id) return null;

  if (await ownerTrialFrozen(row.owner_id)) {
    return {
      card: {
        id: row.id,
        displayName: row.display_name,
        title: "",
        status: asCardStatus(row.status),
        publicToken: row.public_token,
        handle: row.handle?.trim().toLowerCase() || undefined,
        qrVersion: 1,
        contactItemIds: [],
        nextScanAddons: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      items: [],
      ownerId: row.owner_id,
      inactive: true,
    };
  }

  const readyIds = await readyAttachmentIds([row.photo_attachment_id]);
  if (!readyIds.has(row.photo_attachment_id)) return null;

  const admin = createAdminSupabaseClient();
  const { data: linkData, error: linkError } = await admin
    .from("card_items")
    .select("item_id, sort_order")
    .eq("card_id", row.id)
    .eq("visible", true)
    .order("sort_order");
  if (linkError) throw new Error(linkError.message);
  const links = (linkData ?? []) as LinkRow[];

  let itemRows: ItemRow[] = [];
  if (links.length > 0) {
    const { data: itemsData, error: itemsError } = await admin
      .from("items")
      .select("id, type, label, value, url, attachment_id")
      .in(
        "id",
        links.map((link) => link.item_id),
      );
    if (itemsError) throw new Error(itemsError.message);
    itemRows = (itemsData ?? []) as ItemRow[];
  }

  const fileIds = itemRows.flatMap((item) => (item.attachment_id ? [item.attachment_id] : []));
  const readyFiles = await readyAttachmentIds(fileIds);
  const byId = new Map(itemRows.map((item) => [item.id, item]));

  const items: ContactItem[] = [];
  for (const link of links) {
    const item = byId.get(link.item_id);
    if (!item) continue;
    const value = (item.value ?? "").trim();
    if (!value || value.startsWith("data:")) continue;
    items.push({
      id: item.id,
      type: item.type as ContactType,
      label: item.label ?? "",
      value,
      url: publicUrl(item.url, item.attachment_id, readyFiles),
      attachmentId: item.attachment_id && readyFiles.has(item.attachment_id) ? item.attachment_id : undefined,
      order: link.sort_order,
    });
  }

  const card: Card = {
    id: row.id,
    displayName: row.display_name,
    title: row.title?.trim() ?? "",
    status: asCardStatus(row.status),
    publicToken: row.public_token,
    handle: row.handle?.trim().toLowerCase() || undefined,
    qrVersion: 1,
    photoAttachmentId: row.photo_attachment_id,
    contactItemIds: items.map((item) => item.id),
    nextScanAddons: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return { card, items, ownerId: row.owner_id };
});

/** True when this file is the photo or a visible item on a public ready card. */
export async function attachmentIsPublic(attachmentId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const columns = "owner_id, is_public, status, display_name, photo_attachment_id";

  const { data: photoCards, error: photoError } = await admin
    .from("cards")
    .select(columns)
    .eq("photo_attachment_id", attachmentId)
    .limit(5);
  if (photoError) throw new Error(photoError.message);
  for (const card of photoCards ?? []) {
    if (!cardIsPubliclyServed(card)) continue;
    if (!(await ownerTrialFrozen(card.owner_id as string))) return true;
  }

  const { data: itemRows, error: itemError } = await admin
    .from("items")
    .select("id")
    .eq("attachment_id", attachmentId);
  if (itemError) throw new Error(itemError.message);
  const itemIds = (itemRows ?? []).map((item) => item.id as string);
  if (itemIds.length === 0) return false;

  const { data: links, error: linkError } = await admin
    .from("card_items")
    .select("card_id")
    .in("item_id", itemIds)
    .eq("visible", true);
  if (linkError) throw new Error(linkError.message);
  const cardIds = [...new Set((links ?? []).map((link) => link.card_id as string))];
  if (cardIds.length === 0) return false;

  const { data: cards, error: cardError } = await admin.from("cards").select(columns).in("id", cardIds);
  if (cardError) throw new Error(cardError.message);
  for (const card of cards ?? []) {
    if (!cardIsPubliclyServed(card)) continue;
    if (!(await ownerTrialFrozen(card.owner_id as string))) return true;
  }
  return false;
}

/** Counts a visit. The owner's own session is not a visit. Messenger crawlers still count. */
export async function logPublicCardOpen(cardId: string, ownerId: string): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (data.user?.id === ownerId) return;
  } catch {
    // No session: this is a visitor.
  }

  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from("card_events").insert({ card_id: cardId, type: "card_open" });
    if (error) console.error("[public-card] card_open", error.message);
  } catch (error) {
    console.error("[public-card] card_open", error);
  }
}
