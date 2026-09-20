import type { Card, CardSnapshot, ContactItem, NextScanAddon } from "@/shared/types";

export function getCardItems(card: Card, library: ContactItem[]) {
  return library
    .filter((item) => card.contactItemIds.includes(item.id) && item.value.trim())
    .sort((a, b) => a.order - b.order);
}

export function getNextScanAddons(card: Card): NextScanAddon[] {
  return card.nextScanAddons ?? [];
}

export function buildCardSnapshot(card: Card, library: ContactItem[]): CardSnapshot {
  const nextScanAddons = getNextScanAddons(card);
  return {
    displayName: card.displayName,
    photo: card.photo,
    title: card.title,
    subtitle: "",
    description: "",
    items: getCardItems(card, library),
    nextScanAddons: nextScanAddons.length > 0 ? nextScanAddons : undefined,
  };
}
