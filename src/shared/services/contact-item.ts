import { nanoid } from "nanoid";
import type { Card, ContactItem, ContactType } from "@/shared/types";
import {
  detectAttachmentType,
  displayHandleForType,
  inferAttachmentLabel,
  matchServicePrefix,
  matchSocialDomain,
  profileUrlForType,
  typeLabel,
} from "./portfolio-catalog";
import { isAttachmentType, validateTextValue } from "./portfolio-limits";

export { typeLabel } from "./portfolio-catalog";
export {
  PORTFOLIO_ITEM_CATALOG,
  PORTFOLIO_DOCUMENT_ACCEPT,
  PORTFOLIO_FILE_ACCEPT,
  PORTFOLIO_GALLERY_ACCEPT,
} from "./portfolio-catalog";
export {
  PORTFOLIO_LIMITS,
  validatePortfolioAttachment,
  validateTextValue,
  formatBytes,
  isAttachmentType,
} from "./portfolio-limits";

export const EMPTY_CONTACT_PLACEHOLDER = "add contact, link, file etc.";

const DOMAIN = /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE = /^\+?[\d\s()-]{7,}$/;
const PREFIX = /^([a-z][a-z0-9]*):(.+)$/i;
const BARE_HANDLE = /^@([a-z0-9._]{1,30})$/i;

function detectDataUrlType(value: string): ContactType | null {
  if (value.startsWith("data:application/pdf")) return "pdf";
  if (value.startsWith("data:image/")) return "photo";
  if (value.startsWith("data:audio/")) return "audio";
  if (value.startsWith("data:video/")) return "video";
  if (value.includes("presentationml") || value.includes("ms-powerpoint")) return "presentation";
  if (value.includes("wordprocessingml") || value.includes("msword")) return "document";
  if (value.includes("spreadsheetml") || value.includes("ms-excel")) return "spreadsheet";
  return null;
}

function detectUrlPathType(value: string): ContactType | null {
  if (/\.pdf(?:$|[?#])/i.test(value)) return "pdf";
  if (/\.(ppt|pptx|key)(?:$|[?#])/i.test(value)) return "presentation";
  if (/\.(doc|docx|txt|rtf)(?:$|[?#])/i.test(value)) return "document";
  if (/\.(xls|xlsx|csv)(?:$|[?#])/i.test(value)) return "spreadsheet";
  if (/\.(mp3|m4a|wav)(?:$|[?#])/i.test(value)) return "audio";
  if (/\.(mp4|mov|m4v)(?:$|[?#])/i.test(value)) return "video";
  if (/\.(png|jpe?g|gif|webp|heic|svg)(?:$|[?#])/i.test(value)) return "photo";
  return null;
}

function parseTypedShortcut(raw: string): { type: ContactType; handle: string } | null {
  const prefixMatch = raw.match(PREFIX);
  if (prefixMatch) {
    const type = matchServicePrefix(prefixMatch[1] ?? "");
    const handle = (prefixMatch[2] ?? "").trim();
    if (type && handle) return { type, handle };
  }

  const bare = raw.match(BARE_HANDLE);
  if (bare?.[1]) return { type: "instagram", handle: bare[1] };

  return null;
}

export function detectContactType(raw: string): ContactType {
  const value = raw.trim();
  if (!value) return "text";

  const dataType = detectDataUrlType(value);
  if (dataType) return dataType;

  if (EMAIL.test(value)) return "email";
  if (PHONE.test(value)) return "phone";

  const shortcut = parseTypedShortcut(value);
  if (shortcut) return shortcut.type;

  if (!DOMAIN.test(value)) return "text";

  const pathType = detectUrlPathType(value);
  if (pathType) return pathType;

  try {
    const host = new URL(value.startsWith("http") ? value : `https://${value}`).hostname;
    const social = matchSocialDomain(host);
    if (social) return social;
    return "website";
  } catch {
    return "text";
  }
}

export function rowTypeLabel(item: ContactItem): string | null {
  if (!isContactFilled(item)) return null;
  if (item.label.trim()) return item.label;
  return typeLabel(item.type);
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
  const trimmed = value.slice(0, 2000);
  const type = detectContactType(trimmed);
  const shortcut = parseTypedShortcut(trimmed);
  let url = trimmed;

  if (type === "text") url = "";
  else if (type === "email") url = `mailto:${trimmed}`;
  else if (type === "phone") url = `tel:${trimmed.replace(/\s/g, "")}`;
  else if (isAttachmentType(type)) url = trimmed.startsWith("data:") ? trimmed : item.url || trimmed;
  else if (shortcut) url = profileUrlForType(shortcut.type, shortcut.handle) ?? "";
  else if (!trimmed.startsWith("http") && !trimmed.startsWith("data:")) url = `https://${trimmed}`;

  const label =
    isAttachmentType(type) && item.label.trim()
      ? item.label
      : typeLabel(type);

  return {
    ...item,
    type,
    label,
    value: trimmed,
    url,
  };
}

function bareUrl(raw: string): string {
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

/** Chip / row text: hide the `service:` prefix, keep the handle. */
export function itemDisplayValue(item: ContactItem): string {
  const raw = item.value.trim();
  if (!raw) return item.label;

  const shortcut = parseTypedShortcut(raw);
  if (shortcut) return displayHandleForType(shortcut.type, shortcut.handle);

  if (raw.startsWith("data:")) return item.label || typeLabel(item.type);

  if (
    item.type !== "text" &&
    item.type !== "email" &&
    item.type !== "phone" &&
    (raw.includes("://") || DOMAIN.test(raw))
  ) {
    return bareUrl(raw);
  }

  return raw;
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

export function contactItemFromAttachment(
  item: ContactItem,
  file: File,
  dataUrl: string,
): ContactItem {
  const type = detectAttachmentType(file);
  const label = inferAttachmentLabel(type, file.name);
  const value = file.name.trim() || label;
  return { ...item, type, label, value, url: dataUrl };
}

export function validateContactTextInput(value: string): string | null {
  const result = validateTextValue(value);
  return result.ok ? null : result.message;
}
