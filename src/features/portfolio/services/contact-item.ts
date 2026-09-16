import { nanoid } from "nanoid";
import type { Card, CardSnapshot, ContactItem, ContactType, NextScanAddon } from "@/shared/types";

const SOCIAL: Record<string, ContactType> = {
  "instagram.com": "instagram",
  "linkedin.com": "linkedin",
  "t.me": "telegram",
  "telegram.me": "telegram",
  "spotify.com": "audio",
};

/** Only a value that is entirely a domain counts as a link. */
const DOMAIN = /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE = /^\+?[\d\s()-]{7,}$/;

export function detectContactType(raw: string, mime?: string): ContactType {
  const v = raw.trim();
  if (!v) return "text";
  if (mime === "application/pdf" || v.startsWith("data:application/pdf")) return "pdf";
  if (EMAIL.test(v)) return "email";
  if (PHONE.test(v)) return "phone";

  // A domain mentioned inside a sentence stays plain text, never a link.
  if (!DOMAIN.test(v)) return "text";
  if (/\.pdf(?:$|\?)/i.test(v)) return "pdf";

  try {
    const host = new URL(v.startsWith("http") ? v : `https://${v}`).hostname.replace(
      /^www\./,
      "",
    );
    for (const [domain, type] of Object.entries(SOCIAL)) {
      if (host === domain || host.endsWith(`.${domain}`)) return type;
    }
    return "website";
  } catch {
    return "text";
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
    audio: "Audio",
    text: "Note",
    link: "Link",
    custom: "Link",
  };
  return map[type] ?? "Link";
}

export function buildContactItem(value: string, mime?: string, label?: string): ContactItem {
  const type = detectContactType(value, mime);
  const now = new Date().toISOString();
  let url = value;
  if (type === "text") url = "";
  else if (type === "email") url = `mailto:${value}`;
  else if (type === "phone") url = `tel:${value.replace(/\s/g, "")}`;
  else if (!value.startsWith("http") && !value.startsWith("data:")) url = `https://${value}`;

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
    type: "text",
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

function bareDomain(raw: string): string {
  return raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

/** Social profiles read as handles rather than full URLs. */
function socialHandle(raw: string): string {
  if (raw.startsWith("@")) return raw;
  const segments = bareDomain(raw).split("/");
  const handle = segments[1]?.replace(/\/$/, "");
  return handle ? `@${handle}` : bareDomain(raw);
}

export function itemDisplayValue(item: ContactItem): string {
  const raw = (item.value.trim() || item.label).trim();
  if (!raw) return "";

  if (item.type === "pdf") {
    if (raw.startsWith("data:")) return item.label || "Document";
    const name = raw.split("?")[0].split("/").pop();
    return name || raw;
  }
  if (item.type === "instagram") return socialHandle(raw);
  if (item.type === "text") return raw;
  return bareDomain(raw);
}

export type ContactGroupKey = "contact" | "social" | "files" | "site" | "other";

const GROUP_OF: Record<ContactType, ContactGroupKey> = {
  phone: "contact",
  email: "contact",
  instagram: "social",
  telegram: "social",
  linkedin: "social",
  pdf: "files",
  website: "site",
  audio: "other",
  text: "other",
  link: "other",
  custom: "other",
};

const GROUP_ORDER: ContactGroupKey[] = ["contact", "social", "files", "site", "other"];

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
