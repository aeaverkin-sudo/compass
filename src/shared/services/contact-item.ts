import type { Card, ContactItem, ContactType } from "@/shared/types";
import {
  attachmentTypeForName,
  detectAttachmentType,
  inferAttachmentLabel,
  matchServicePrefix,
  matchSocialDomain,
  messengerNationalDigits,
  messengerPhoneDigits,
  messengerUsername,
  profileUrlForType,
  splitMessengerInput,
  typeLabel,
} from "./portfolio-catalog";
import { isAttachmentType, validateTextValue } from "./portfolio-limits";
import { linkDisplay } from "./link-display";

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
  return attachmentTypeForName(value);
}

/** Host-only addresses whose last label is also a file extension, e.g. studio.ai. */
const HOST_FILE_TLDS = new Set(["ai"]);

function isHostOnlyAddress(value: string) {
  const path = value.split(/[?#]/)[0] ?? value;
  const stripped = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/+$/, "");
  if (stripped.includes("/")) return false;
  const extension = stripped.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!extension || !HOST_FILE_TLDS.has(extension)) return false;
  return /^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(stripped);
}

export const MESSENGER_COUNTRY_HINT = "Add a country code, e.g. +351…";

/** WhatsApp or Telegram keyword plus a number that has no leading +. No link, and no guessed country code. */
export function messengerCountryHint(raw: string): string | null {
  const messenger = splitMessengerInput(raw);
  if (!messenger) return null;
  if (messengerPhoneDigits(messenger.handle)) return null;
  if (messenger.type === "telegram" && messengerUsername(messenger.handle)) return null;
  if (!messengerNationalDigits(messenger.handle)) return null;
  return MESSENGER_COUNTRY_HINT;
}

function parseTypedShortcut(raw: string): { type: ContactType; handle: string } | null {
  const messenger = splitMessengerInput(raw);
  if (messenger) {
    if (!profileUrlForType(messenger.type, messenger.handle)) return null;
    return messenger;
  }

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

  const namedFile = attachmentTypeForName(value);
  if (namedFile && !value.includes("\n") && !isHostOnlyAddress(value)) return namedFile;

  if (!DOMAIN.test(value)) return "text";

  const pathType = detectUrlPathType(value);
  if (pathType && !isHostOnlyAddress(value)) return pathType;

  try {
    const host = new URL(value.startsWith("http") ? value : `https://${value}`).hostname;
    const social = matchSocialDomain(host);
    if (social) return social;
    return "website";
  } catch {
    return "text";
  }
}

export function isContactFilled(item: ContactItem): boolean {
  return item.value.trim().length > 0;
}

/** One record per non-empty line. Blank lines are skipped. */
export function splitDraftLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Store a line as the field's own kind. A typed field does not guess again. */
export function contactLineAsType(seed: ContactItem, raw: string, type: ContactType): ContactItem {
  const trimmed = raw.trim().slice(0, 2000);
  if (type === "text" || type === "position" || type === "custom") {
    return { ...seed, type, value: trimmed, url: "" };
  }
  if (type === "email") {
    const stored = trimmed.toLowerCase();
    return { ...seed, type, value: stored, url: `mailto:${stored}` };
  }
  if (type === "phone") {
    return { ...seed, type, value: trimmed, url: `tel:${trimmed.replace(/\s/g, "")}` };
  }
  if (isAttachmentType(type)) return { ...seed, type, value: trimmed };
  const stored = URL_HOST_TYPES.has(type) ? lowerHostname(trimmed) : trimmed;
  let url = "";
  if (/^https?:\/\//i.test(stored) || stored.startsWith("data:")) url = stored;
  else url = profileUrlForType(type, stored) ?? (type === "website" || type === "link" ? `https://${stored}` : "");
  return { ...seed, type, value: stored, url };
}

export function createEmptyContactItem(order: number): ContactItem {
  return {
    id: crypto.randomUUID(),
    type: "text",
    label: "",
    value: "",
    url: "",
    order,
  };
}

const URL_HOST_TYPES = new Set<ContactType>([
  "website",
  "link",
  "instagram",
  "linkedin",
  "meta",
  "x",
  "youtube",
  "tiktok",
  "github",
  "behance",
  "dribbble",
  "spotify",
  "calendly",
  "appstore",
  "playstore",
  "telegram",
  "whatsapp",
]);

/** Lowercase the host. Path and query stay as typed. A bare domain is all host. */
function lowerHostname(value: string): string {
  const match = value.match(/^((?:[a-z][a-z0-9+.-]*:\/\/)?)([^/?#]+)(.*)$/i);
  if (!match) return value;
  const scheme = match[1] ?? "";
  const host = match[2] ?? "";
  const rest = match[3] ?? "";
  const at = host.lastIndexOf("@");
  const auth = at >= 0 ? host.slice(0, at + 1) : "";
  const hostPort = at >= 0 ? host.slice(at + 1) : host;
  const portMatch = hostPort.match(/^(.*?)(:\d+)$/);
  const name = portMatch?.[1] ?? hostPort;
  const port = portMatch?.[2] ?? "";
  if (!name.includes(".")) return value;
  return `${scheme}${auth}${name.toLowerCase()}${port}${rest}`;
}

function storedContactValue(type: ContactType, value: string): string {
  if (type === "email") return value.toLowerCase();
  if (URL_HOST_TYPES.has(type)) return lowerHostname(value);
  return value;
}

export function normalizeContactItem(item: ContactItem, value: string): ContactItem {
  const trimmed = value.slice(0, 2000);
  const type = detectContactType(trimmed);
  const stored = storedContactValue(type, trimmed);
  const shortcut = parseTypedShortcut(trimmed);
  let url = stored;

  const keptKind = item.type === "position" && type === "text";
  const resolved = keptKind ? item.type : type;
  const label = isAttachmentType(resolved) ? item.label : keptCustomLabel(item, resolved);

  if (keptKind) {
    return {
      ...item,
      type: item.type,
      label,
      value: stored,
      url: "",
    };
  }

  if (type === "text" || type === "position") url = "";
  else if (type === "email") url = `mailto:${stored}`;
  else if (type === "phone") url = `tel:${stored.replace(/\s/g, "")}`;
  else if (isAttachmentType(type)) url = stored.startsWith("data:") ? stored : item.url || stored;
  else if (shortcut) url = profileUrlForType(shortcut.type, shortcut.handle) ?? "";
  else if (!/^https?:/i.test(stored) && !stored.startsWith("data:")) url = `https://${stored}`;

  return {
    ...item,
    type,
    label,
    value: stored,
    url,
  };
}

function keptCustomLabel(item: ContactItem, nextType: ContactType) {
  const label = item.label.trim();
  if (!label) return "";
  const platform =
    label.localeCompare(typeLabel(item.type), undefined, { sensitivity: "accent" }) === 0 ||
    label.localeCompare(typeLabel(nextType), undefined, { sensitivity: "accent" }) === 0;
  return platform ? "" : label;
}

/** Chip / row text. Display only — the stored url stays intact. */
export function itemDisplayValue(item: ContactItem): string {
  return linkDisplay(item);
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
