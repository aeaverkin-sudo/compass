import { nanoid } from "nanoid";
import type { Card, ContactItem, ContactType } from "@/shared/types";

export const EMPTY_CONTACT_PLACEHOLDER = "add contact, link, file etc.";

const DOMAIN = /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE = /^\+?[\d\s()-]{7,}$/;

export function detectContactType(raw: string): ContactType {
  const value = raw.trim();
  if (!value) return "text";
  if (EMAIL.test(value)) return "email";
  if (PHONE.test(value)) return "phone";
  if (!DOMAIN.test(value)) return "text";

  try {
    const host = new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(
      /^www\./,
      "",
    );
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("t.me") || host.includes("telegram.me")) return "telegram";
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
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    link: "Link",
    text: "Text",
    custom: "Link",
  };
  return map[type] ?? "Link";
}

export function isContactFilled(item: ContactItem): boolean {
  return item.value.trim().length > 0;
}

export function createEmptyContactItem(order: number): ContactItem {
  return {
    id: nanoid(),
    type: "text",
    label: "",
    value: "",
    url: "",
    order,
  };
}

export function normalizeContactItem(item: ContactItem, value: string): ContactItem {
  const trimmed = value;
  const type = detectContactType(trimmed);
  let url = trimmed;

  if (type === "text") url = "";
  else if (type === "email") url = `mailto:${trimmed}`;
  else if (type === "phone") url = `tel:${trimmed.replace(/\s/g, "")}`;
  else if (!trimmed.startsWith("http") && !trimmed.startsWith("data:")) url = `https://${trimmed}`;

  return {
    ...item,
    type,
    label: typeLabel(type),
    value: trimmed,
    url,
  };
}

/** Card-linked library rows, including empty drafts. */
export function getLibraryItems(card: Card, library: ContactItem[]): ContactItem[] {
  const map = new Map(library.map((item) => [item.id, item]));
  return card.contactItemIds
    .map((id) => map.get(id))
    .filter((item): item is ContactItem => Boolean(item));
}

export function sortContactList(library: ContactItem[], activeIds: string[]): ContactItem[] {
  const active = new Set(activeIds);
  return [...library].sort((a, b) => {
    const onCardA = active.has(a.id) ? 0 : 1;
    const onCardB = active.has(b.id) ? 0 : 1;
    if (onCardA !== onCardB) return onCardA - onCardB;
    return a.order - b.order;
  });
}

export function isItemOnCard(card: Card, itemId: string): boolean {
  return card.contactItemIds.includes(itemId);
}
