import type { Card, ContactItem, ContactType } from "@/shared/types";
import { isContactFilled } from "@/shared/services/contact-item";
import { isAttachmentType } from "@/shared/services/portfolio-limits";
import { itemContentKey } from "@/shared/services/item-key";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { upsertCardScalars } from "@/shared/services/card-sync";
import { signupDrafting } from "@/shared/services/signup-gate";

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

function localKey(item: ContactItem) {
  return itemContentKey(item.type, textValue(item), item.attachmentId);
}

/** A file whose upload never finished: no stored file and no local preview. */
function unfinishedFile(item: ContactItem) {
  return isAttachmentType(item.type) && !item.attachmentId && !item.url.startsWith("data:");
}

/** `null` drops the row from the card. */
function remapCard(card: Card, ids: Map<string, string | null>): Card {
  const touches = (id: string) => ids.has(id);
  const zones = card.itemZones ?? {};
  const header = card.headerItemId && touches(card.headerItemId);
  if (!card.contactItemIds.some(touches) && !Object.keys(zones).some(touches) && !header) return card;
  const swap = (id: string) => (ids.has(id) ? (ids.get(id) ?? null) : id);
  const contactItemIds = [...new Set(card.contactItemIds.map(swap).filter((id): id is string => id !== null))];
  const itemZones: Record<string, string> = {};
  const entries = Object.entries(zones).sort(([left], [right]) => Number(touches(left)) - Number(touches(right)));
  for (const [id, zone] of entries) {
    const next = swap(id);
    if (next && !(next in itemZones)) itemZones[next] = zone;
  }
  const headerItemId = card.headerItemId ? (swap(card.headerItemId) ?? undefined) : undefined;
  return { ...card, contactItemIds, itemZones: card.itemZones ? itemZones : undefined, headerItemId };
}

async function markSynced(itemId: string, owner: string) {
  const { useAppStore } = await import("@/shared/store/app-store");
  const { contactItems } = useAppStore.getState();
  if (!contactItems.some((item) => item.id === itemId && item.syncedOwner !== owner)) return;
  useAppStore.setState({
    contactItems: contactItems.map((item) => (item.id === itemId ? { ...item, syncedOwner: owner } : item)),
  });
}

/** The owner already has this line under another id: the device takes that id. */
async function joinTwin(item: ContactItem, owner: string): Promise<string | null> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, type, label, value, url, attachment_id")
    .eq("owner_id", owner)
    .eq("type", item.type);
  if (error) return null;
  const key = localKey(item);
  const twin = ((data ?? []) as ItemRow[]).find(
    (row) => row.id !== item.id && itemContentKey(row.type, row.value ?? "", row.attachment_id) === key,
  );
  if (!twin) return null;

  const { useAppStore } = await import("@/shared/store/app-store");
  const state = useAppStore.getState();
  const saved = state.contactItems.find((entry) => entry.id === item.id)?.syncedOwner === owner;
  const known = state.contactItems.some((entry) => entry.id === twin.id);
  const contactItems = known
    ? state.contactItems.filter((entry) => entry.id !== item.id)
    : state.contactItems.map((entry) =>
        entry.id === item.id ? mergeItem(entry, twin, entry.order, owner) : entry,
      );
  const ids = new Map([[item.id, twin.id]]);
  const cards = state.cards.map((card) => remapCard(card, ids));
  useAppStore.setState({ cards, contactItems });
  // An edited row that now reads like another one: the old row would come back on the next load.
  if (saved) {
    await supabase.from("card_items").delete().eq("item_id", item.id);
    await deleteItemRow(item.id);
  }
  for (const card of cards) {
    if (card === state.cards.find((entry) => entry.id === card.id)) continue;
    await upsertCardScalars(card);
    await upsertLinks(card);
  }
  return twin.id;
}

async function freshCard(card: Card): Promise<Card> {
  const { useAppStore } = await import("@/shared/store/app-store");
  return useAppStore.getState().cards.find((entry) => entry.id === card.id) ?? card;
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

/** The id the row lives under on the server, or null when it was not saved. */
async function upsertItemRow(item: ContactItem): Promise<string | null> {
  if (!isUuid(item.id)) return null;
  const userId = await ownerId();
  if (!userId) return null;

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
  if (!error) {
    await markSynced(item.id, userId);
    return item.id;
  }
  if (error.code === "23505") {
    const twin = await joinTwin(item, userId);
    if (twin) return twin;
  }
  console.error("[card-items] item upsert failed", error.message);
  return null;
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

export function dropPendingItemUpserts() {
  for (const pending of pendingItemUpserts.values()) clearTimeout(pending.timer);
  pendingItemUpserts.clear();
}

export function scheduleItemUpsert(item: ContactItem, options?: { pulse?: boolean }) {
  if (signupDrafting()) return;
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
    const saved = await upsertItemRow(item);
    if (saved === item.id || saved === null) await upsertLinks(await freshCard(card));
    const { requestLiveQrPulse } = await import("@/shared/lib/live-qr-pulse");
    requestLiveQrPulse(card.id);
  } catch (error) {
    console.error("[card-items] sync failed", error);
  }
}

export async function syncCardLinkOrder(card: Card, items: ContactItem[]) {
  if (signupDrafting()) return;
  try {
    await upsertCardScalars(card);
    const onCard = new Set(card.contactItemIds);
    await Promise.all(items.filter((item) => onCard.has(item.id)).map((item) => upsertItemRow(item)));
    await upsertLinks(await freshCard(card));
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

function mergeItem(local: ContactItem | undefined, row: ItemRow, order: number, owner: string): ContactItem {
  const remoteAttachmentId = row.attachment_id ?? undefined;
  return {
    syncedOwner: owner,
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
  const remoteByKey = new Map<string, ItemRow>();
  for (const row of remoteItems) {
    const key = itemContentKey(row.type, row.value ?? "", row.attachment_id);
    if (key && !remoteByKey.has(key)) remoteByKey.set(key, row);
  }

  // The server is the record for rows it has seen. A device only adds rows it made itself.
  const moved = new Map<string, string | null>();
  const items: ContactItem[] = [];
  rekeyed.items.forEach((item, index) => {
    const row = remoteById.get(item.id);
    if (row) return void items.push(mergeItem(item, row, index, userId));
    if (item.syncedOwner === userId && remoteItems.length > 0) return void moved.set(item.id, null);
    if (!item.syncedOwner) {
      const key = localKey(item);
      const twin = key ? remoteByKey.get(key) : undefined;
      if (twin) return void moved.set(item.id, twin.id);
    }
    items.push(item);
  });
  remoteItems.forEach((row, index) => {
    if (!items.some((item) => item.id === row.id)) items.push(mergeItem(undefined, row, index, userId));
  });

  const linksByCard = new Map<string, LinkRow[]>();
  for (const link of linkData) {
    const list = linksByCard.get(link.card_id) ?? [];
    list.push(link);
    linksByCard.set(link.card_id, list);
  }

  const touched = new Set<string>();
  const cards = rekeyed.cards.map((card) => {
    const joined = new Set(card.contactItemIds.map((id) => moved.get(id)).filter((id): id is string => Boolean(id)));
    const mapped = remapCard(card, moved);
    if (mapped !== card) touched.add(card.id);
    const links = (linksByCard.get(card.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    if (links.length === 0) return mapped;
    const remoteIds = links.map((link) => link.item_id);
    const remoteSet = new Set(remoteIds);
    // A server row missing from this card's links was taken off it on another device.
    const localOnly = mapped.contactItemIds.filter((id) => !remoteSet.has(id) && (!remoteById.has(id) || joined.has(id)));
    return { ...mapped, contactItemIds: [...remoteIds, ...localOnly] };
  });

  useAppStore.setState({ cards, contactItems: items });

  const remoteItemIds = new Set(remoteItems.map((row) => row.id));
  const storeOwner = useAppStore.getState().ownerId;
  const mayUploadLocal = Boolean(userId && storeOwner === userId);
  const toUpload = items.filter(
    (item) =>
      mayUploadLocal &&
      !remoteItemIds.has(item.id) &&
      !item.syncedOwner &&
      !unfinishedFile(item) &&
      (isContactFilled(item) || cards.some((card) => card.contactItemIds.includes(item.id))),
  );
  const dropped = [...moved.values()].filter((id) => id === null).length;
  if (toUpload.length > 0 || moved.size > 0) {
    console.info(
      `[card-items] hydrate: ${toUpload.length} new from this device, ${moved.size - dropped} joined to the same line, ${dropped} deleted elsewhere`,
    );
  }
  await Promise.all(toUpload.map((item) => upsertItemRow(item)));

  const own = new Set(useAppStore.getState().contactItems.filter((item) => item.syncedOwner === userId).map((item) => item.id));
  const remoteLinkKeys = new Set(linkData.map((link) => `${link.card_id}:${link.item_id}`));
  for (const card of useAppStore.getState().cards) {
    if (touched.has(card.id)) await upsertCardScalars(card);
    const missing = card.contactItemIds.some((itemId) => own.has(itemId) && !remoteLinkKeys.has(`${card.id}:${itemId}`));
    if (missing) await upsertLinks(card);
  }
}
