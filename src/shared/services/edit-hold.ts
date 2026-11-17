import type { Card, ContactItem } from "@/shared/types";
import { isContactFilled } from "@/shared/services/contact-item";
type Snapshot = { cards: Card[]; contactItems: ContactItem[] };
type Plan = { cardIds: string[]; itemIds: string[]; dropped: string[]; unlinks: [string, string][] };

let held: Snapshot | null = null;
let missedHydrate = false;
let unsent: Plan | null = null;
let sending: Promise<void> | null = null;

/** Edit is open: nothing about the portfolio leaves the phone until Save. */
export function editHeld() {
  return held !== null;
}

/** `flush` sends writes queued before Edit opened, while the gate is still open. */
export function beginEditHold(cards: Card[], contactItems: ContactItem[], flush: () => void) {
  if (held) return;
  flush();
  held = { cards, contactItems };
}

function samePhoto(a: Card, b: Card) {
  return a.photo === b.photo && a.photoAttachmentId === b.photoAttachmentId && a.photoLook === b.photoLook;
}

/** A photo is its own action: the confirmed card goes out with the new photo, the rest waits for Save. */
export function heldCardWrite(card: Card): Card | null {
  if (!held) return card;
  const base = held.cards.find((entry) => entry.id === card.id);
  if (!base || samePhoto(base, card)) return null;
  const next: Card = {
    ...base,
    photo: card.photo,
    photoAttachmentId: card.photoAttachmentId,
    photoLook: card.photoLook,
    updatedAt: card.updatedAt,
  };
  held = { ...held, cards: held.cards.map((entry) => (entry.id === card.id ? next : entry)) };
  return next;
}

export function noteHeldHydrate() {
  missedHydrate = true;
}

function sameCard(a: Card, b: Card) {
  return JSON.stringify({ ...a, updatedAt: "" }) === JSON.stringify({ ...b, updatedAt: "" });
}

function sameItem(a: ContactItem, b: ContactItem) {
  return JSON.stringify({ ...a, syncedOwner: undefined }) === JSON.stringify({ ...b, syncedOwner: undefined });
}

function planEdit(before: Snapshot, cards: Card[], items: ContactItem[]): Plan {
  const oldCards = new Map(before.cards.map((card) => [card.id, card]));
  const oldItems = new Map(before.contactItems.map((item) => [item.id, item]));
  const liveItems = new Set(items.map((item) => item.id));
  const onCards = new Set(cards.flatMap((card) => card.contactItemIds));
  const unlinks: [string, string][] = [];
  for (const card of cards) {
    const old = oldCards.get(card.id);
    if (!old) continue;
    const now = new Set(card.contactItemIds);
    for (const id of old.contactItemIds) if (!now.has(id)) unlinks.push([card.id, id]);
  }
  return {
    cardIds: cards.filter((card) => !oldCards.has(card.id) || !sameCard(oldCards.get(card.id)!, card)).map((card) => card.id),
    itemIds: items
      .filter((item) => !oldItems.has(item.id) || !sameItem(oldItems.get(item.id)!, item))
      .filter((item) => isContactFilled(item) || onCards.has(item.id))
      .map((item) => item.id),
    dropped: before.contactItems.filter((item) => !liveItems.has(item.id)).map((item) => item.id),
    unlinks,
  };
}

function mergePlans(a: Plan, b: Plan): Plan {
  const pairs = new Map([...a.unlinks, ...b.unlinks].map((pair) => [pair.join(":"), pair] as const));
  return {
    cardIds: [...new Set([...a.cardIds, ...b.cardIds])],
    itemIds: [...new Set([...a.itemIds, ...b.itemIds])],
    dropped: [...new Set([...a.dropped, ...b.dropped])],
    unlinks: [...pairs.values()],
  };
}

async function sendPlan(plan: Plan): Promise<boolean> {
  const { useAppStore } = await import("@/shared/store/app-store");
  const { upsertCardScalars } = await import("./card-sync");
  const { upsertItemRow, upsertLinks, unlinkItem, deleteItemRow } = await import("./card-items-sync");
  let ok = true;
  for (const id of plan.itemIds) {
    const item = useAppStore.getState().contactItems.find((entry) => entry.id === id);
    if (item && (await upsertItemRow(item)) === null) ok = false;
  }
  for (const id of plan.cardIds) {
    const card = useAppStore.getState().cards.find((entry) => entry.id === id);
    if (!card) continue;
    if ((await upsertCardScalars(card)) !== "ok") {
      ok = false;
      continue;
    }
    await upsertLinks(useAppStore.getState().cards.find((entry) => entry.id === id) ?? card);
  }
  for (const [cardId, itemId] of plan.unlinks) await unlinkItem(cardId, itemId);
  for (const id of plan.dropped) await deleteItemRow(id);
  const changed = new Set(plan.itemIds);
  const pulsed = useAppStore
    .getState()
    .cards.filter((card) => plan.cardIds.includes(card.id) || card.contactItemIds.some((id) => changed.has(id)));
  if (pulsed.length > 0) {
    const { requestLiveQrPulse } = await import("@/shared/lib/live-qr-pulse");
    for (const card of pulsed) requestLiveQrPulse(card.id);
  }
  return ok;
}

/** Without a network the plan waits and goes out when the phone is back online. */
export function sendUnsentEdit(): Promise<void> {
  if (sending) return sending;
  sending = (async () => {
    while (unsent) {
      const plan = unsent;
      unsent = null;
      const ok = await sendPlan(plan);
      if (!ok && !navigator.onLine) {
        unsent = unsent ? mergePlans(plan, unsent) : plan;
        break;
      }
    }
  })()
    .catch((error) => console.error("[edit-hold] send failed", error))
    .finally(() => {
      sending = null;
    });
  return sending;
}

/** A server load skipped during Edit runs once the edit is settled and sent. */
async function sendThenCatchUp() {
  await sendUnsentEdit();
  if (!missedHydrate || unsent || held) return;
  missedHydrate = false;
  const { hydrateCardsFromServer } = await import("./card-sync");
  await hydrateCardsFromServer();
}

/** Save: everything changed since Edit opened goes to the server at once. */
export function commitEditHold(cards: Card[], contactItems: ContactItem[]) {
  const before = held;
  if (!before) return;
  held = null;
  const plan = planEdit(before, cards, contactItems);
  unsent = unsent ? mergePlans(unsent, plan) : plan;
  void sendThenCatchUp();
}

/** Back without Save: the portfolio returns to how it was when Edit opened. The photo stays, it was already sent. */
export function discardEditHold(
  cards: Card[],
  restore: (state: { cards: Card[]; contactItems: ContactItem[] }) => void,
) {
  const before = held;
  if (!before) return;
  held = null;
  const kept = new Map(before.cards.map((card) => [card.id, card]));
  restore({
    cards: cards.map((card) => {
      const old = kept.get(card.id);
      if (!old) return card;
      return { ...old, photo: card.photo, photoAttachmentId: card.photoAttachmentId, photoLook: card.photoLook };
    }),
    contactItems: before.contactItems,
  });
  void sendThenCatchUp();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (unsent) void sendThenCatchUp();
  });
}
