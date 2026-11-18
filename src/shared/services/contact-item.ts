import type { Card, ContactItem, ContactType } from "@/shared/types";
import {
  attachmentTypeForName,
  detectAttachmentType,
  inferAttachmentLabel,
  matchServicePrefix,
  matchSocialDomain,
  SERVICE_PREFIX_ALIASES,
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

/** The account mailbox. A portfolio line uses detectContactType instead. */
export function isAccountEmail(value: string) {
  return EMAIL.test(value.trim());
}
/** A phone is 7 to 15 digits. Spaces, brackets and dashes do not count. + may only be first. */
function isPhone(value: string) {
  if (!/^\+?[\d\s()-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}
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

/** Messenger keyword plus a number that has no leading +. No link, and no guessed country code. Telegram still accepts a username. */
export function messengerCountryHint(raw: string): string | null {
  const messenger = splitMessengerInput(raw);
  if (!messenger) return null;
  if (messengerPhoneDigits(messenger.handle)) return null;
  if (messenger.type === "telegram" && messengerUsername(messenger.handle)) return null;
  if (!messengerNationalDigits(messenger.handle)) return null;
  return MESSENGER_COUNTRY_HINT;
}

/** A nick or a +number after the name, even when the service has no profile link. */
const NICK_MESSENGERS = new Set<ContactType>(["messenger", "wechat", "line", "discord", "kakaotalk", "zalo"]);

const SERVICE_PHRASES: { phrase: string; type: ContactType }[] = (() => {
  const seen = new Set<string>();
  const list: { phrase: string; type: ContactType }[] = [];
  const add = (phrase: string, type: ContactType) => {
    const key = phrase.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push({ phrase: key, type });
  };
  for (const [alias, type] of Object.entries(SERVICE_PREFIX_ALIASES)) add(alias, type);
  for (const type of new Set(Object.values(SERVICE_PREFIX_ALIASES))) add(typeLabel(type), type);
  list.sort((a, b) => b.phrase.length - a.phrase.length);
  return list;
})();

/** `Instagram / @anna`, `Instagram / anna`, `Instagram @anna`. A space without @ stays plain text. */
function slashOrAtShortcut(raw: string): { type: ContactType; handle: string } | null {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  for (const { phrase, type } of SERVICE_PHRASES) {
    if (!lower.startsWith(phrase)) continue;
    const boundary = lower.charAt(phrase.length);
    if (boundary && /[a-z0-9]/i.test(boundary)) continue;
    const rest = trimmed.slice(phrase.length);
    let handle = "";
    if (/^\s*\/\s*/.test(rest)) handle = rest.replace(/^\s*\/\s*/, "");
    else if (/^\s+@/.test(rest)) handle = rest.replace(/^\s+/, "");
    else continue;
    handle = handle.trim().replace(/^@+/, "").trim();
    if (!handle) continue;
    if (type !== "position" && !NICK_MESSENGERS.has(type) && !profileUrlForType(type, handle)) continue;
    return { type, handle };
  }
  return null;
}

/** `WeChat anna`, `Discord anna`. A space without @, only for messengers that are typed that way. Contacts only. */
function spaceNickShortcut(raw: string): { type: ContactType; handle: string } | null {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  for (const { phrase, type } of SERVICE_PHRASES) {
    if (!NICK_MESSENGERS.has(type)) continue;
    if (!lower.startsWith(phrase)) continue;
    const boundary = lower.charAt(phrase.length);
    if (boundary && /[a-z0-9]/i.test(boundary)) continue;
    const rest = trimmed.slice(phrase.length);
    if (!/^\s+/.test(rest) || /^\s*\//.test(rest)) continue;
    const handle = rest.trim().replace(/^@+/, "").trim();
    if (!messengerUsername(handle) && !messengerPhoneDigits(handle)) continue;
    return { type, handle };
  }
  return null;
}

function parseTypedShortcut(raw: string, zone?: string): { type: ContactType; handle: string } | null {
  const messenger = splitMessengerInput(raw);
  if (messenger) {
    if (!profileUrlForType(messenger.type, messenger.handle)) return null;
    return messenger;
  }

  if (zone === "contact") {
    const named = spaceNickShortcut(raw);
    if (named) return named;
  }

  const prefixMatch = raw.match(PREFIX);
  if (prefixMatch) {
    const type = matchServicePrefix(prefixMatch[1] ?? "");
    const handle = (prefixMatch[2] ?? "").trim();
    if (type && handle) return { type, handle };
  }

  const marked = slashOrAtShortcut(raw);
  if (marked) return marked;

  const bare = raw.match(BARE_HANDLE);
  if (bare?.[1]) {
    if (zone === "contact") {
      const nick = messengerUsername(bare[0]);
      if (!nick || !profileUrlForType("telegram", nick)) return null;
      return { type: "telegram", handle: nick };
    }
    return { type: "instagram", handle: bare[1] };
  }

  return null;
}

export function detectContactType(raw: string, zone?: string): ContactType {
  const value = raw.trim();
  if (!value) return "text";

  const dataType = detectDataUrlType(value);
  if (dataType) return dataType;

  if (EMAIL.test(value)) return "email";
  if (isPhone(value)) return "phone";

  const shortcut = parseTypedShortcut(value, zone);
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

/** A library row with exactly this value, edges trimmed and nothing else. Files are not compared. */
export function findIdenticalItem(items: ContactItem[], value: string, exceptId?: string): ContactItem | undefined {
  const line = value.trim();
  if (!line) return undefined;
  return items.find((item) => item.id !== exceptId && !isAttachmentType(item.type) && item.value.trim() === line);
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
  "threads",
  "pinterest",
  "snapchat",
  "reddit",
  "twitch",
  "github",
  "behance",
  "dribbble",
  "spotify",
  "applemusic",
  "calendly",
  "appstore",
  "playstore",
  "telegram",
  "whatsapp",
  "viber",
  "signal",
  "messenger",
  "line",
  "zalo",
  "vimeo",
  "soundcloud",
  "discord",
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

export function normalizeContactItem(item: ContactItem, value: string, zone?: string): ContactItem {
  const trimmed = value.slice(0, 2000);
  const type = detectContactType(trimmed, zone);
  const stored = storedContactValue(type, trimmed);
  const shortcut = parseTypedShortcut(trimmed, zone);
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
