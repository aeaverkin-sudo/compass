import type { Card, ContactItem, ContactType } from "@/shared/types";
import { isContactFilled } from "@/shared/services/contact-item";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { upsertCardScalars } from "@/shared/services/card-sync";

const UPSERT_DEBOUNCE_MS = 400;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ItemRow = {
  id: string;
  type: string;
  label: string;
  value: string;
  url: string;
  attachment_id: string | null;
};

type LinkRow = {
  card_id: string;
  item_id: string;
  sort_order: number;
};

const pendingItemUpserts = new Map<string, { timer: ReturnType<typeof setTimeout>; item: ContactItem }>();

function isUuid(id: string) {
  return UUID_RE.test(id);
}

/** Replace legacy nanoid item ids everywhere they are referenced. */
export function rekeyContactItems(cards: Card[], items: ContactItem[]) {
  const nextIds = new Map<string, string>();
  const nextItems = items.map((item) => {
    if (isUuid(item.id)) return item;
    const id = crypto.randomUUID();
    nextIds.set(item.id, id);
    return { ...item, id };
  });
  if (nextIds.size === 0) return { cards, items };
  return {
    items: nextItems,
    cards: cards.map((card) => ({
      ...card,
      contactItemIds: card.contactItemIds.map((id) => nextIds.get(id) ?? id),
    })),
  };
}

function textValue(item: ContactItem) {
  return item.value.startsWith("data:") ? item.label : item.value;
}

function textUrl(item: ContactItem) {
  return item.url.startsWith("data:") ? "" : item.url;
}

async function ownerId() {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (!data.user) {
    if (error && error.name !== "AuthSessionMissingError") {
      console.error("[card-items]", error.message);
    }
    return null;
  }
  return data.user.id;
}

async function upsertItemRow(item: ContactItem) {
  if (!isUuid(item.id)) return;
  const userId = await ownerId();
  if (!userId) return;

  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.from("items").upsert(
    {
      id: item.id,
      owner_id: userId,
      type: item.type,
      label: item.label,
      value: textValue(item),
      url: textUrl(item),
      attachment_id: item.attachmentId ?? null,
    },
    { onConflict: "id", defaultToNull: false },
  );
  if (error) console.error("[card-items] item upsert failed", error.message);
}

/** Link rows conflict on the pair, not on the random row id. */
async function upsertLink(cardId: string, itemId: string, sortOrder: number) {
  if (!isUuid(cardId) || !isUuid(itemId)) return;
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.from("card_items").upsert(
    {
      card_id: cardId,
      item_id: itemId,
      sort_order: sortOrder,
      visible: true,
    },
    { onConflict: "card_id,item_id", defaultToNull: false },
  );
  if (error) console.error("[card-items] link upsert failed", error.message);
}

async function upsertLinks(card: Card) {
  await Promise.all(card.contactItemIds.map((itemId, index) => upsertLink(card.id, itemId, index)));
}

export function scheduleItemUpsert(item: ContactItem, options?: { pulse?: boolean }) {
  const previous = pendingItemUpserts.get(item.id);
  if (previous) clearTimeout(previous.timer);
  const pulse = options?.pulse !== false;
  const timer = setTimeout(() => {
    pendingItemUpserts.delete(item.id);
    void upsertItemRow(item)
      .then(async () => {
        if (!pulse) return;
        const { useAppStore } = await import("@/shared/store/app-store");
        const { requestLiveQrPulse } = await import("@/shared/lib/live-qr-pulse");
        const state = useAppStore.getState();
        const card = state.cards[state.currentCardIndex];
        if (card?.contactItemIds.includes(item.id)) requestLiveQrPulse(card.id);
      })
      .catch((error) => console.error("[card-items] item upsert failed", error));
  }, UPSERT_DEBOUNCE_MS);
  pendingItemUpserts.set(item.id, { timer, item });
}

/** Save the pool row, then every link on this card with the current order. */
export async function syncItemOnCard(card: Card, item: ContactItem) {
  try {
    await upsertCardScalars(card);
    await upsertItemRow(item);
    await upsertLinks(card);
    const { requestLiveQrPulse } = await import("@/shared/lib/live-qr-pulse");
    requestLiveQrPulse(card.id);
  } catch (error) {
    console.error("[card-items] sync failed", error);
  }
}

export async function syncCardLinkOrder(card: Card, items: ContactItem[]) {
  try {
    await upsertCardScalars(card);
    const onCard = new Set(card.contactItemIds);
    await Promise.all(items.filter((item) => onCard.has(item.id)).map((item) => upsertItemRow(item)));
    await upsertLinks(card);
    const { requestLiveQrPulse } = await import("@/shared/lib/live-qr-pulse");
    requestLiveQrPulse(card.id);
  } catch (error) {
    console.error("[card-items] reorder failed", error);
  }
}

export async function unlinkItem(cardId: string, itemId: string) {
  try {
    if (!isUuid(cardId) || !isUuid(itemId)) return;
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("card_items").delete().eq("card_id", cardId).eq("item_id", itemId);
    if (error) console.error("[card-items] unlink failed", error.message);
    const { requestLiveQrPulse } = await import("@/shared/lib/live-qr-pulse");
    requestLiveQrPulse(cardId);
  } catch (error) {
    console.error("[card-items] unlink failed", error);
  }
}

export async function deleteItemRow(itemId: string) {
  try {
    if (!isUuid(itemId)) return;
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("items").delete().eq("id", itemId);
    if (error) console.error("[card-items] delete failed", error.message);
  } catch (error) {
    console.error("[card-items] delete failed", error);
  }
}

function asType(value: string): ContactType {
  return value as ContactType;
}

function mergeItem(local: ContactItem | undefined, row: ItemRow, order: number): ContactItem {
  const remoteAttachmentId = row.attachment_id ?? undefined;
  return {
    id: row.id,
    type: asType(row.type),
    label: row.label ?? "",
    value: row.value ?? "",
    url: remoteAttachmentId ? "" : local?.url.startsWith("data:") ? local.url : (row.url ?? ""),
    attachmentId: remoteAttachmentId ?? local?.attachmentId,
    order: local?.order ?? order,
  };
}

export async function hydrateCardItems() {
  const userId = await ownerId();
  if (!userId) return;

  const { useAppStore } = await import("@/shared/store/app-store");
  const state = useAppStore.getState();
  const rekeyed = rekeyContactItems(state.cards, state.contactItems);

  const supabase = createBrowserSupabaseClient();
  const { data: itemData, error: itemError } = await supabase
    .from("items")
    .select("id, type, label, value, url, attachment_id")
    .eq("owner_id", userId);
  if (itemError) {
    console.error("[card-items] load failed", itemError.message);
    return;
  }

  const cardIds = rekeyed.cards.map((card) => card.id).filter(isUuid);
  let linkData: LinkRow[] = [];
  if (cardIds.length > 0) {
    const { data, error } = await supabase
      .from("card_items")
      .select("card_id, item_id, sort_order")
      .in("card_id", cardIds);
    if (error) {
      console.error("[card-items] links load failed", error.message);
      return;
    }
    linkData = (data ?? []) as LinkRow[];
  }

  const remoteItems = (itemData ?? []) as ItemRow[];
  const remoteById = new Map(remoteItems.map((row) => [row.id, row]));
  const items: ContactItem[] = rekeyed.items.map((item, index) => {
    const row = remoteById.get(item.id);
    return row ? mergeItem(item, row, index) : item;
  });
  remoteItems.forEach((row, index) => {
    if (!items.some((item) => item.id === row.id)) items.push(mergeItem(undefined, row, index));
  });

  const linksByCard = new Map<string, LinkRow[]>();
  for (const link of linkData) {
    const list = linksByCard.get(link.card_id) ?? [];
    list.push(link);
    linksByCard.set(link.card_id, list);
  }

  const cards = rekeyed.cards.map((card) => {
    const links = (linksByCard.get(card.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    if (links.length === 0) return card;
    const remoteIds = links.map((link) => link.item_id);
    const remoteSet = new Set(remoteIds);
    const localOnly = card.contactItemIds.filter((id) => !remoteSet.has(id));
    return { ...card, contactItemIds: [...remoteIds, ...localOnly] };
  });

  useAppStore.setState({ cards, contactItems: items });

  const remoteItemIds = new Set(remoteItems.map((row) => row.id));
  const toUpload = items.filter(
    (item) => !remoteItemIds.has(item.id) && (isContactFilled(item) || cards.some((card) => card.contactItemIds.includes(item.id))),
  );
  await Promise.all(toUpload.map((item) => upsertItemRow(item)));

  const remoteLinkKeys = new Set(linkData.map((link) => `${link.card_id}:${link.item_id}`));
  for (const card of cards) {
    const missing = card.contactItemIds.some((itemId) => !remoteLinkKeys.has(`${card.id}:${itemId}`));
    if (missing) await upsertLinks(card);
  }
}
