import type { Card, CardSnapshot, ContactItem } from "@/shared/types";

export function getCardItems(card: Card, library: ContactItem[]) {
  return library
    .filter((item) => card.contactItemIds.includes(item.id) && item.value.trim())
    .sort((a, b) => a.order - b.order);
}

export function buildCardSnapshot(card: Card, library: ContactItem[]): CardSnapshot {
  return {
    displayName: card.displayName,
    photo: card.photo,
    title: card.title,
    subtitle: "",
    description: "",
    items: getCardItems(card, library),
  };
}
