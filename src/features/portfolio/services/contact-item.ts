import { nanoid } from "nanoid";
import type { Card, CardSnapshot, ContactItem, ContactType, NextScanAddon } from "@/shared/types";

const SOCIAL: Record<string, ContactType> = {
  "instagram.com": "instagram",
  "linkedin.com": "linkedin",
  "t.me": "telegram",
  "telegram.me": "telegram",
};

export function detectContactType(raw: string, mime?: string): ContactType {
  const v = raw.trim();
  if (!v) return "custom";
  if (mime === "application/pdf" || v.includes(".pdf") || v.startsWith("data:application/pdf"))
    return "pdf";
  if (v.includes("@") && !v.includes(" ")) return "email";
  if (/^\+?[\d\s()-]{7,}$/.test(v)) return "phone";
  try {
    const url = new URL(v.startsWith("http") ? v : `https://${v}`);
    const host = url.hostname.replace("www.", "");
    for (const [h, t] of Object.entries(SOCIAL)) {
      if (host.includes(h)) return t;
    }
    return "website";
  } catch {
    return "custom";
  }
}

export function typeLabel(type: ContactType): string {
  const map: Record<ContactType, string> = {
    instagram: "Instagram",
    linkedin: "LinkedIn",
    website: "Website",
    email: "Email",
    phone: "Phone",
    pdf: "Pitch Deck",
    telegram: "Telegram",
    link: "Link",
    custom: "Link",
  };
  return map[type] ?? "Link";
}

export function buildContactItem(value: string, mime?: string, label?: string): ContactItem {
  const type = detectContactType(value, mime);
  const now = new Date().toISOString();
  let url = value;
  if (type === "email") url = `mailto:${value}`;
  else if (type === "phone") url = `tel:${value.replace(/\s/g, "")}`;
  else if (!value.startsWith("http") && (type === "website" || type === "instagram" || type === "linkedin"))
    url = `https://${value}`;

  return {
    id: nanoid(),
    type,
    label: label?.trim() || typeLabel(type),
    value,
    url,
    order: 0,
    createdAt: now,
  };
}

export function createEmptyContactItem(order: number): ContactItem {
  return {
    id: nanoid(),
    type: "custom",
    label: "",
    value: "",
    url: "",
    order,
    createdAt: new Date().toISOString(),
  };
}

export function createCard(label = "Personal", overrides?: Partial<Card>): Card {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    label,
    displayName: "",
    title: "",
    subtitle: "",
    description: "",
    location: "",
    contactItemIds: [],
    nextScanAddons: [],
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function isContactFilled(item: ContactItem): boolean {
  return item.value.trim().length > 0;
}

export function getCardItems(card: Card, library: ContactItem[]): ContactItem[] {
  const map = new Map(library.map((i) => [i.id, i]));
  return card.contactItemIds
    .map((id) => map.get(id))
    .filter((i): i is ContactItem => Boolean(i && isContactFilled(i)));
}

export function sortContactList(library: ContactItem[], activeIds: string[]): ContactItem[] {
  const active = new Set(activeIds);
  return [...library].sort((a, b) => {
    const aa = active.has(a.id) ? 0 : 1;
    const bb = active.has(b.id) ? 0 : 1;
    if (aa !== bb) return aa - bb;
    return a.order - b.order;
  });
}

export function isCardReady(card: Card): boolean {
  return Boolean(card.displayName.trim() && card.photo);
}

export function itemDisplayValue(item: ContactItem): string {
  const raw = item.label || item.value;
  return raw.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

/** Full readable line for preview/editor — no truncation. */
export function itemFullLine(item: ContactItem): string {
  const value = itemDisplayValue(item);
  if (item.type === "pdf") {
    const name = value.split("/").pop() || value;
    return `${typeLabel(item.type)} ${name}`;
  }
  return `${typeLabel(item.type)} ${value}`;
}

export type ContactGroupKey = "direct" | "social" | "web" | "files";

const GROUP_OF: Record<ContactType, ContactGroupKey> = {
  phone: "direct",
  email: "direct",
  instagram: "social",
  linkedin: "social",
  telegram: "social",
  website: "web",
  link: "web",
  custom: "web",
  pdf: "files",
};

const GROUP_ORDER: ContactGroupKey[] = ["direct", "social", "web", "files"];

export const CONTACT_GROUP_LABELS: Record<ContactGroupKey, string> = {
  direct: "Contact",
  social: "Social",
  web: "Links",
  files: "Files",
};

export function groupContactItems(
  items: ContactItem[],
): { key: ContactGroupKey; items: ContactItem[] }[] {
  return GROUP_ORDER.map((key) => ({
    key,
    items: items.filter((i) => GROUP_OF[i.type] === key),
  })).filter((group) => group.items.length > 0);
}

export function itemCompactLabel(item: ContactItem): string {
  return `${typeLabel(item.type)} · ${itemDisplayValue(item).replace(/^@/, "")}`;
}

export function getNextScanAddons(card: Card): NextScanAddon[] {
  if (card.nextScanAddons?.length) return card.nextScanAddons;
  const legacy = card.nextScanAddon as NextScanAddon | null | undefined;
  if (!legacy) return [];
  return [{ ...legacy, id: legacy.id ?? nanoid() }];
}

export function buildCardSnapshot(card: Card, library: ContactItem[]): CardSnapshot {
  const nextScanAddons = getNextScanAddons(card);
  return {
    label: card.label,
    displayName: card.displayName,
    photo: card.photo,
    title: card.title,
    subtitle: card.subtitle,
    description: card.description,
    location: card.location,
    items: getCardItems(card, library),
    nextScanAddons,
  };
}

export function getSnapshotDisplayName(snapshot: CardSnapshot): string {
  if (snapshot.displayName?.trim()) return snapshot.displayName.trim();
  const legacy = [snapshot.firstName, snapshot.lastName].filter(Boolean).join(" ").trim();
  return legacy || snapshot.name || snapshot.label || "";
}

export function getSnapshotItems(snapshot: CardSnapshot): ContactItem[] {
  if (snapshot.items?.length) return snapshot.items;
  return (snapshot.slots ?? []).map((slot, order) => ({
    id: slot.id,
    type: slot.type === "pdf" ? "pdf" : slot.type === "link" ? "website" : "custom",
    label: slot.label,
    value: slot.value,
    url: slot.value.startsWith("http") ? slot.value : `https://${slot.value}`,
    order,
    createdAt: new Date(0).toISOString(),
  }));
}
