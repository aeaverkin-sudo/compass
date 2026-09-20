import type { Card, CardSnapshot, ContactItem, NextScanAddon } from "@/shared/types";

export function getCardItems(card: Card, library: ContactItem[]) {
  const map = new Map(library.map((item) => [item.id, item]));
  return card.contactItemIds
    .map((id) => map.get(id))
    .filter((item): item is ContactItem => Boolean(item?.value.trim()));
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
