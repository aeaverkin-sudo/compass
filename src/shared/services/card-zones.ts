import type { ContactItem, ContactType } from "@/shared/types";
import { createEmptyContactItem, detectContactType, itemDisplayValue, normalizeContactItem } from "./contact-item";
import { isAttachmentType } from "./portfolio-limits";
import { typeLabel } from "./portfolio-catalog";

export const CARD_ZONES = [
  { id: "name", title: "Name" },
  { id: "age", title: "Age" },
  { id: "company", title: "Company" },
  { id: "position", title: "Position" },
  { id: "background", title: "Background" },
  { id: "education", title: "Education" },
  { id: "location", title: "Location" },
  { id: "languages", title: "Languages" },
  { id: "web", title: "Web" },
  { id: "social", title: "Social" },
  { id: "contact", title: "Contact" },
  { id: "files", title: "Files" },
  { id: "lifestyle", title: "Lifestyle" },
  { id: "about", title: "About" },
] as const;

export type CardZoneId = (typeof CARD_ZONES)[number]["id"] | `extra-${number}`;

const EXTRA_ZONE = /^extra-(\d+)$/;

export function isExtraZoneId(value: string): value is `extra-${number}` {
  return EXTRA_ZONE.test(value);
}

export function nextExtraZoneId(order: string[]): `extra-${number}` {
  let max = 0;
  for (const id of order) {
    const match = EXTRA_ZONE.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `extra-${max + 1}`;
}

/** The seven library shelves. Empty ones stay off the edit list until they have a row. */
export const BASE_EDIT_ZONES: readonly CardZoneId[] = [
  "position",
  "location",
  "web",
  "social",
  "contact",
  "files",
  "about",
];

export const ZONE_HINTS: Partial<Record<CardZoneId, string>> = {
  position: "Role",
  location: "City, country",
  web: "Website",
  social: "Instagram, etc.",
  contact: "Email, phone, messenger",
  files: "PDF, JPG, …",
  about: "Write about yourself",
};

const ZONE_IDS = new Set<string>(CARD_ZONES.map((zone) => zone.id));

export type CardZoneScope = {
  rubricLabels?: Record<string, string>;
  itemZones?: Record<string, string>;
  hiddenZones?: string[];
  rubricOrder?: string[];
};

/** A portfolio that can already hold this library row. */
export type CardZonePlacement = CardZoneScope & {
  id: string;
  contactItemIds: string[];
};

/** Stored `additional` is the old About id. */
export function canonZoneId(value: string | undefined): CardZoneId | undefined {
  if (!value) return undefined;
  if (value === "additional") return "about";
  if (ZONE_IDS.has(value)) return value as CardZoneId;
  if (isExtraZoneId(value)) return value;
  return undefined;
}

export function isCardZoneId(value: string): value is CardZoneId {
  return ZONE_IDS.has(value) || isExtraZoneId(value);
}

/** Shown heading. A stored empty title stays empty. A missing one uses the built-in name. */
export function zoneTitle(card: CardZoneScope | null | undefined, zoneId: string, defaultTitle: string) {
  const id = canonZoneId(zoneId) ?? zoneId;
  const labels = card?.rubricLabels;
  if (labels && Object.hasOwn(labels, id)) return labels[id].trim();
  if (id === "about") {
    const additional = labels?.additional?.trim();
    if (additional) return additional;
  }
  return defaultTitle;
}

/** This card's section for the row. The item's own type stays where it is. */
export function effectiveZone(card: CardZoneScope | null | undefined, item: ContactItem): CardZoneId {
  const override = canonZoneId(card?.itemZones?.[item.id]);
  if (override) return override;
  return zoneForItem(item);
}

/**
 * Another card's explicit pin for this row. Guesses from old heuristics do not count.
 */
export function zoneFromPlacements(
  item: ContactItem,
  cards: CardZonePlacement[],
  exceptCardId?: string,
): CardZoneId | undefined {
  for (const card of cards) {
    if (exceptCardId && card.id === exceptCardId) continue;
    if (!card.contactItemIds.includes(item.id)) continue;
    const override = canonZoneId(card.itemZones?.[item.id]);
    if (override) return override;
  }
  return undefined;
}

/** The section the user put this row in. It stays, even when the text would guess the same shelf. */
export function withItemZone(
  card: CardZoneScope,
  item: ContactItem,
  zoneId: CardZoneId,
): Record<string, string> | undefined {
  const zones = { ...(card.itemZones ?? {}), [item.id]: zoneId };
  return Object.keys(zones).length > 0 ? zones : undefined;
}

export type PositionLine = {
  title: string;
  company?: string;
};

export type CardDisplayRow = {
  key: string;
  item: ContactItem | null;
  axis: string;
  value: string;
  url: string;
};

export type CardZoneSection = {
  id: CardZoneId;
  title: string;
  rows: CardDisplayRow[];
};

const WEB_TYPES = new Set<ContactType>([
  "website",
  "link",
  "custom",
  "calendly",
  "appstore",
  "playstore",
]);

const SOCIAL_TYPES = new Set<ContactType>([
  "instagram",
  "linkedin",
  "meta",
  "x",
  "youtube",
  "tiktok",
  "threads",
  "snapchat",
  "reddit",
  "twitch",
  "github",
  "behance",
  "dribbble",
]);

const LIFESTYLE_TYPES = new Set<ContactType>(["pinterest", "spotify", "applemusic"]);

const CONTACT_TYPES = new Set<ContactType>(["email", "phone", "whatsapp", "telegram", "viber", "signal"]);

/** A messenger needs its name on the row. A phone number alone is indistinguishable from Phone. */
const MESSENGER_TYPES = new Set<ContactType>(["whatsapp", "telegram", "viber", "signal"]);

const FILE_AXIS: Partial<Record<ContactType, string>> = {
  pdf: "PDF",
  photo: "IMG",
  presentation: "PPT",
  document: "DOC",
  spreadsheet: "XLS",
  audio: "AUD",
  video: "VID",
};

type RoleSource = {
  canonical: string;
  rank: number;
  operator: boolean;
  source: string;
  head?: boolean;
};

const ROLES: RoleSource[] = [
  { canonical: "Co-founder", rank: 100, operator: true, source: String.raw`\bco[-\s]?founders?\b` },
  { canonical: "Founder", rank: 98, operator: true, source: String.raw`\b(?:founding|founders?)\b` },
  { canonical: "CEO", rank: 92, operator: true, source: String.raw`\b(?:chief executive officers?|ceos?|c\.e\.o\.?s?)\b` },
  { canonical: "CTO", rank: 90, operator: true, source: String.raw`\b(?:chief technology officers?|ctos?|c\.t\.o\.?s?)\b` },
  { canonical: "CFO", rank: 88, operator: true, source: String.raw`\b(?:chief financial officers?|cfos?|c\.f\.o\.?s?)\b` },
  { canonical: "COO", rank: 86, operator: true, source: String.raw`\b(?:chief operating officers?|coos?|c\.o\.o\.?s?)\b` },
  { canonical: "CMO", rank: 84, operator: true, source: String.raw`\b(?:chief marketing officers?|cmos?|c\.m\.o\.?s?)\b` },
  { canonical: "CPO", rank: 84, operator: true, source: String.raw`\b(?:chief product officers?|cpos?|c\.p\.o\.?s?)\b` },
  { canonical: "President", rank: 80, operator: true, source: String.raw`\bpresidents?\b` },
  { canonical: "Owner", rank: 78, operator: true, source: String.raw`\bowners?\b` },
  { canonical: "Managing Director", rank: 76, operator: true, source: String.raw`\bmanaging directors?\b` },
  { canonical: "Managing Director", rank: 76, operator: true, source: String.raw`\b(?:md|m\.d\.?)s?\b` },
  { canonical: "Managing Partner", rank: 74, operator: true, source: String.raw`\bmanaging partners?\b` },
  { canonical: "General Partner", rank: 72, operator: true, source: String.raw`\bgeneral partners?\b` },
  { canonical: "General Partner", rank: 72, operator: true, source: String.raw`\b(?:gp|g\.p\.?)s?\b` },
  { canonical: "Partner", rank: 68, operator: true, source: String.raw`\bpartners?\b` },
  { canonical: "Angel Investor", rank: 66, operator: false, source: String.raw`\bangel investors?\b` },
  { canonical: "Angel", rank: 64, operator: false, source: String.raw`\bangels?\b` },
  { canonical: "Investor", rank: 62, operator: false, source: String.raw`\binvestors?\b` },
  { canonical: "VC", rank: 62, operator: false, source: String.raw`\b(?:venture capitalists?|vcs?)\b` },
  { canonical: "Board Member", rank: 58, operator: false, source: String.raw`\bboard members?\b` },
  { canonical: "Advisor", rank: 56, operator: false, source: String.raw`\badvis[oe]rs?\b` },
  {
    canonical: "Head",
    rank: 54,
    operator: true,
    head: true,
    source: String.raw`\bhead of\s+\p{L}[\p{L}\d&.'’\-]*(?:\s+\p{L}[\p{L}\d&.'’\-]*){0,3}`,
  },
  { canonical: "VP", rank: 52, operator: true, source: String.raw`\bvice presidents?\b` },
  { canonical: "VP", rank: 52, operator: true, source: String.raw`\b(?:vp|v\.p\.?)s?\b` },
  { canonical: "Director", rank: 48, operator: true, source: String.raw`\bdirectors?\b` },
  { canonical: "Lead", rank: 46, operator: true, source: String.raw`\bleads?\b` },
  { canonical: "Consultant", rank: 40, operator: false, source: String.raw`\bconsultants?\b` },
  { canonical: "Freelance", rank: 38, operator: false, source: String.raw`\bfreelance(?:rs?)?\b` },
  { canonical: "Independent", rank: 36, operator: false, source: String.raw`\bindependents?\b` },
];

type RoleHit = {
  canonical: string;
  display: string;
  rank: number;
  operator: boolean;
  start: number;
  end: number;
};

const COMPANY_SOURCE = String.raw`\b(of|at|@)\s+([\p{L}\d][\p{L}\d&.'’+\-]*(?:\s+[\p{L}\d][\p{L}\d&.'’+\-]*){0,2})`;

export function isExplicitPosition(item: ContactItem) {
  return item.type === "position" || item.label.trim().toLowerCase() === "position";
}

/** A paragraph, not a name, role, or one-line fact. */
export function isProseValue(text: string) {
  const line = text.trim();
  if (!line) return false;
  if (line.includes("\n")) return true;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length >= 9) return true;
  if (line.length >= 72) return true;
  return false;
}

/**
 * Honest shelf: a machine type goes to its zone. Free text stays About.
 * Role words, cities, and names are not silent moves.
 */
export function zoneForItem(item: ContactItem): CardZoneId {
  if (WEB_TYPES.has(item.type)) return "web";
  if (SOCIAL_TYPES.has(item.type)) return "social";
  if (isAttachmentType(item.type)) return "files";
  if (LIFESTYLE_TYPES.has(item.type)) return "lifestyle";
  if (CONTACT_TYPES.has(item.type)) return "contact";
  if (isExplicitPosition(item)) return "position";
  return "about";
}

/** A short Position or Company row. A tap places that one line under the portfolio title. */
export function isChoosableHeader(item: ContactItem, zoneId?: CardZoneId) {
  if (isProseValue(item.value)) return false;
  const zone = zoneId ?? zoneForItem(item);
  return zone === "position" || zone === "company";
}

/** One row toggles. Several rows step forward, then clear, then start again. */
export function nextHeaderChoice(
  currentId: string | undefined,
  rows: { id: string; value: string }[],
): { id?: string; title: string } {
  const list = rows.filter((row) => row.value.trim() && !isProseValue(row.value));
  if (list.length === 0) return { title: "" };
  const titleOf = (row: { value: string }) => row.value.trim();
  if (list.length === 1) {
    if (currentId === list[0].id) return { title: "" };
    return { id: list[0].id, title: titleOf(list[0]) };
  }
  const index = list.findIndex((row) => row.id === currentId);
  const next = index < 0 ? list[0] : list[index + 1];
  if (!next) return { title: "" };
  return { id: next.id, title: titleOf(next) };
}

export function parseDescription(text: string): { position: PositionLine | null; remainders: string[] } {
  const source = text.trim();
  if (!source || isProseValue(source)) return { position: null, remainders: [] };

  const hits = collectRoles(source);
  if (hits.length === 0) return { position: null, remainders: [] };

  const ranked = [...hits].sort((a, b) => b.rank - a.rank || a.start - b.start);
  const shown = ranked.slice(0, 2);
  const company = findCompany(source, hits, shown);
  const remove: Array<[number, number]> = hits.map((hit) => [hit.start, hit.end]);
  if (company) remove.push([company.start, company.end]);

  return {
    position: {
      title: joinRoles(shown),
      company: company?.name,
    },
    remainders: remainderLines(source, remove),
  };
}

function trackedHref(token: string | undefined, itemId: string, direct: string) {
  if (!token || !direct) return direct;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId)) return direct;
  if (direct.startsWith("/f/") || /^https?:\/\//i.test(direct)) return `/r/${token}/${itemId}`;
  return direct;
}

export function composeCard(
  items: ContactItem[],
  publicToken?: string,
  scope?: CardZoneScope,
): { position: PositionLine | null; zones: CardZoneSection[] } {
  const buckets = new Map<CardZoneId, CardDisplayRow[]>();
  for (const item of items) pushDisplayed(buckets, item, publicToken, scope);
  return { position: null, zones: sectionsFrom(buckets, scope) };
}

export function groupLibrary(
  items: ContactItem[],
  scope?: CardZoneScope & Partial<CardZonePlacement>,
  placements: CardZonePlacement[] = [],
): CardZoneSection[] {
  const buckets = new Map<CardZoneId, CardDisplayRow[]>();
  const onThis = scope?.contactItemIds ? new Set(scope.contactItemIds) : null;
  const exceptId = scope && "id" in scope ? scope.id : undefined;
  for (const item of items) {
    const onCard = onThis?.has(item.id) ?? true;
    const zone = onCard
      ? effectiveZone(scope, item)
      : (zoneFromPlacements(item, placements, exceptId) ?? zoneForItem(item));
    pushDisplayed(buckets, item, undefined, scope, zone);
  }
  return sectionsFrom(buckets, scope);
}

/** Edit list: shelves with rows, plus an emptied shelf whose title is still stored. */
export function groupEditSections(
  items: ContactItem[],
  scope: CardZoneScope & Partial<CardZonePlacement>,
  placements: CardZonePlacement[] = [],
): CardZoneSection[] {
  const filled = groupLibrary(items, scope, placements);
  const byId = new Map(filled.map((section) => [section.id, section]));
  const hidden = new Set(
    (scope.hiddenZones ?? []).flatMap((id) => {
      const zone = canonZoneId(id);
      return zone ? [zone] : [];
    }),
  );
  const ids: CardZoneId[] = [];
  const labeled = new Set(
    Object.keys(scope.rubricLabels ?? {}).flatMap((raw) => {
      const id = canonZoneId(raw);
      return id ? [id] : [];
    }),
  );
  for (const id of BASE_EDIT_ZONES) {
    const rows = byId.get(id)?.rows.length ?? 0;
    if (rows === 0 && (hidden.has(id) || !labeled.has(id))) continue;
    ids.push(id);
  }
  for (const zone of CARD_ZONES) {
    if (ids.includes(zone.id)) continue;
    if ((byId.get(zone.id)?.rows.length ?? 0) > 0) ids.push(zone.id);
  }
  for (const raw of scope.rubricOrder ?? []) {
    const id = canonZoneId(raw);
    if (!id || !isExtraZoneId(id) || ids.includes(id)) continue;
    const rows = byId.get(id)?.rows.length ?? 0;
    if (hidden.has(id) && rows === 0) continue;
    ids.push(id);
  }
  for (const id of byId.keys()) {
    if (!isExtraZoneId(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  const ordered = orderCardZones(
    ids.map((id) => ({ id })),
    scope.rubricOrder,
  ).map((zone) => zone.id as CardZoneId);
  return ordered.map((id) => {
    const meta = CARD_ZONES.find((zone) => zone.id === id);
    const found = byId.get(id);
    return {
      id,
      title: zoneTitle(scope, id, meta?.title ?? ""),
      rows: found?.rows ?? [],
    };
  });
}

function pushDisplayed(
  buckets: Map<CardZoneId, CardDisplayRow[]>,
  item: ContactItem,
  publicToken?: string,
  scope?: CardZoneScope,
  forcedZone?: CardZoneId,
) {
  const split = splitPresentation(item);
  if (!split) return;
  const zone = forcedZone ?? effectiveZone(scope, item);
  const rows = buckets.get(zone) ?? [];
  const direct = item.attachmentId ? `/f/${item.attachmentId}` : item.url;
  rows.push({
    key: item.id,
    item,
    axis: split.axis,
    value: split.value,
    url: trackedHref(publicToken, item.id, direct),
  });
  buckets.set(zone, rows);
}

function rowAxis(item: ContactItem): string {
  const zone = zoneForItem(item);
  if (zone === "social" || zone === "lifestyle" || MESSENGER_TYPES.has(item.type)) return typeLabel(item.type);
  if (zone === "files") return FILE_AXIS[item.type] ?? "FILE";
  return "";
}

function splitPresentation(item: ContactItem): { axis: string; value: string } | null {
  const display = itemDisplayValue(item).trim();
  if (!display || display === "+") return null;
  return { axis: rowAxis(item), value: display };
}

const YEARS_OLD = /^\d+\s+years\s+old$/i;

/** A blank section title. Age is only the whole line, like `32 years old`. */
export function suggestedSectionTitle(value: string, fileType?: ContactType | null): string | null {
  const line = value.trim();
  if (!fileType && YEARS_OLD.test(line)) return "Age";
  const type = fileType ?? (line ? detectContactType(line) : null);
  if (!type || type === "text") return null;
  return typeLabel(type);
}

/** The same row text the portfolio prints: an axis only where the portfolio prints one. */
export function labeledEntryLine(value: string, fileType?: ContactType | null): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (fileType && isAttachmentType(fileType)) return `${FILE_AXIS[fileType] ?? "FILE"} / ${trimmed}`;
  const item = normalizeContactItem(createEmptyContactItem(0), trimmed);
  const display = itemDisplayValue(item).trim();
  if (!display || display === "+") return trimmed;
  const axis = rowAxis(item);
  return axis ? `${axis} / ${display}` : display;
}

function sectionsFrom(buckets: Map<CardZoneId, CardDisplayRow[]>, scope?: CardZoneScope) {
  const extras = [...buckets.keys()].filter(isExtraZoneId);
  const ids = [...CARD_ZONES.map((zone) => zone.id), ...extras];
  const unique = ids.filter((id, index) => ids.indexOf(id) === index);
  const ordered = orderCardZones(
    unique.map((id) => ({ id })),
    scope?.rubricOrder,
  ).map((zone) => zone.id as CardZoneId);
  return ordered.flatMap((id) => {
    const rows = buckets.get(id) ?? [];
    if (rows.length === 0) return [];
    const meta = CARD_ZONES.find((zone) => zone.id === id);
    return [{ id, title: zoneTitle(scope, id, meta?.title ?? ""), rows }];
  });
}

/** Place one row at `index` inside a section. Every other id keeps its place. */
export function placeItemInZone(allIds: string[], itemId: string, zoneItemIds: string[], index: number) {
  const rest = allIds.filter((id) => id !== itemId);
  const zone = zoneItemIds.filter((id) => id !== itemId && rest.includes(id));
  const at = Math.max(0, Math.min(index, zone.length));
  const anchor = zone[at];
  if (anchor) {
    rest.splice(rest.indexOf(anchor), 0, itemId);
    return rest;
  }
  const previous = zone[zone.length - 1];
  if (!previous) return [...rest, itemId];
  rest.splice(rest.indexOf(previous) + 1, 0, itemId);
  return rest;
}

/** Keep known rubric keys. Anything else is ignored. */
export function normalizeRubricOrder(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const keys: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = canonZoneId(entry);
    if (!id || keys.includes(id)) continue;
    keys.push(id);
  }
  return keys.length > 0 ? keys : undefined;
}

/** Keep known zone ids. An empty string is a title the user erased. */
export function normalizeRubricLabels(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const labels: Record<string, string> = {};
  for (const [zoneId, title] of Object.entries(value)) {
    const id = canonZoneId(zoneId);
    if (!id || typeof title !== "string") continue;
    labels[id] = title.trim().slice(0, 80);
  }
  return Object.keys(labels).length > 0 ? labels : undefined;
}

/** Keep overrides that name a real section. */
export function normalizeItemZones(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const zones: Record<string, string> = {};
  for (const [itemId, zoneId] of Object.entries(value)) {
    const id = typeof zoneId === "string" ? canonZoneId(zoneId) : undefined;
    if (!itemId || !id) continue;
    zones[itemId] = id;
  }
  return Object.keys(zones).length > 0 ? zones : undefined;
}

export function normalizeHiddenZones(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const keys: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = canonZoneId(entry);
    if (!id || keys.includes(id)) continue;
    keys.push(id);
  }
  return keys.length > 0 ? keys : undefined;
}

/** Stored rubric order first. Rubrics the card has not ordered yet keep the default sequence. */
export function orderCardZones<T extends { id: string }>(zones: T[], rubricOrder?: string[]): T[] {
  const stored = normalizeRubricOrder(rubricOrder);
  if (!stored) return zones;
  const rank = new Map<string, number>(stored.map((id, index) => [id, index]));
  const fallback = new Map<string, number>(CARD_ZONES.map((zone, index) => [zone.id, stored.length + index]));
  return [...zones].sort(
    (a, b) => (rank.get(a.id) ?? fallback.get(a.id) ?? 999) - (rank.get(b.id) ?? fallback.get(b.id) ?? 999),
  );
}

/** Move one visible rubric. Keys that are not on screen stay after the visible run. */
export function applyRubricMove(current: string[] | undefined, visibleIds: string[], fromIndex: number, toIndex: number) {
  const visible = orderCardZones(
    visibleIds.map((id) => ({ id })),
    current,
  ).map((zone) => zone.id);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= visible.length || toIndex >= visible.length || fromIndex === toIndex) {
    return normalizeRubricOrder(current) ?? visible;
  }
  const nextVisible = [...visible];
  const [moved] = nextVisible.splice(fromIndex, 1);
  if (!moved) return visible;
  nextVisible.splice(toIndex, 0, moved);
  const rest = (normalizeRubricOrder(current) ?? []).filter((id) => !nextVisible.includes(id));
  return [...nextVisible, ...rest];
}

/**
 * Permute one rubric's rows inside the full id list.
 * Ids from other rubrics stay in their slots.
 */
export function reorderIdsInGroup(allIds: string[], groupIds: string[], fromIndex: number, toIndex: number) {
  const group = groupIds.filter((id) => allIds.includes(id));
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= group.length || toIndex >= group.length || fromIndex === toIndex) {
    return allIds;
  }
  const nextGroup = [...group];
  const [moved] = nextGroup.splice(fromIndex, 1);
  if (!moved) return allIds;
  nextGroup.splice(toIndex, 0, moved);
  const inGroup = new Set(group);
  let cursor = 0;
  return allIds.map((id) => {
    if (!inGroup.has(id)) return id;
    const next = nextGroup[cursor];
    cursor += 1;
    return next ?? id;
  });
}

function collectRoles(text: string): RoleHit[] {
  const found: RoleHit[] = [];
  for (const role of ROLES) {
    const re = new RegExp(role.source, "giu");
    for (const match of text.matchAll(re)) {
      const raw = match[0];
      const start = match.index ?? 0;
      found.push({
        canonical: role.canonical,
        display: role.head ? headTitle(raw) : role.canonical,
        rank: role.rank,
        operator: role.operator,
        start,
        end: start + raw.length,
      });
    }
  }

  found.sort((a, b) => b.end - b.start - (a.end - a.start) || b.rank - a.rank || a.start - b.start);
  const taken: RoleHit[] = [];
  for (const hit of found) {
    if (taken.some((kept) => hit.start < kept.end && hit.end > kept.start)) continue;
    taken.push(hit);
  }
  return taken;
}

function headTitle(raw: string) {
  return raw
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      if (word.toLowerCase() === "of") return "of";
      if (index === 0) return "Head";
      return word[0]!.toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function joinRoles(shown: RoleHit[]) {
  const labels = shown.map((hit) => hit.display);
  if (labels.length < 2) return labels[0] ?? "";
  const [first, second] = shown;
  const sep = first?.operator && second?.operator ? " & " : " · ";
  return `${labels[0]}${sep}${labels[1]}`;
}

function findCompany(text: string, hits: RoleHit[], shown: RoleHit[]) {
  const clauses = splitClauses(text);
  const chosen = new Set(shown);
  const re = new RegExp(COMPANY_SOURCE, "giu");
  let best: { name: string; start: number; end: number } | null = null;

  for (const match of text.matchAll(re)) {
    const prep = match[1] ?? "";
    const rawName = (match[2] ?? "").trim();
    const whole = match[0];
    const start = match.index ?? 0;
    const prepAt = start + whole.lastIndexOf(prep);
    const end = start + whole.length;
    if (!rawName || isStopword(rawName)) continue;
    if (hits.some((hit) => prepAt < hit.end && end > hit.start)) continue;

    const clause = clauses.find((part) => prepAt >= part.start && prepAt < part.end);
    if (!clause) continue;
    const inClause = hits.filter((hit) => hit.start >= clause.start && hit.start < clause.end);
    if (!inClause.some((hit) => chosen.has(hit))) continue;

    if (!best || prepAt < best.start) {
      best = { name: presentCompany(rawName), start: prepAt, end };
    }
  }

  return best;
}

function splitClauses(text: string) {
  const parts: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    const broke = index === text.length || text[index] === "," || text[index] === ";" || text[index] === "\n";
    if (!broke) continue;
    if (text.slice(start, index).trim()) parts.push({ start, end: index });
    start = index + 1;
  }
  return parts;
}

function remainderLines(text: string, remove: Array<[number, number]>) {
  const lines: string[] = [];
  for (const clause of splitClauses(text)) {
    let body = "";
    for (let index = clause.start; index < clause.end; index += 1) {
      if (remove.some(([start, end]) => index >= start && index < end)) continue;
      body += text[index] ?? "";
    }
    const cleaned = stripGlue(body);
    if (!cleaned) continue;
    lines.push(presentRemainder(cleaned));
  }
  return lines;
}

function stripGlue(input: string) {
  let value = input.replace(/\s+/g, " ").trim();
  let previous = "";
  while (value && value !== previous) {
    previous = value;
    if (/^(?:and|&|\/|·|,)$/i.test(value)) return "";
    value = value
      .replace(/^[\s.,;:–—/\-]+|[\s.,;:–—/\-]+$/g, "")
      .replace(/^(?:and|&|\/|·|,)\s+/i, "")
      .replace(/\s+(?:and|&|\/|·|,)$/i, "")
      .trim();
  }
  return value;
}

function presentRemainder(raw: string) {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length > 96 || /[.!?]/.test(trimmed)) return trimmed;
  if (!/^ex[-\s]/i.test(trimmed) && !/\s(?:at|@)\s/i.test(trimmed)) return trimmed;
  return trimmed
    .replace(/\s+at\s+/gi, " @ ")
    .split(" ")
    .map(presentToken)
    .join(" ");
}

function presentToken(word: string) {
  if (word === "@") return "@";
  const ex = /^ex-(.+)$/i.exec(word);
  if (ex?.[1]) return `ex-${capitalize(ex[1])}`;
  if (/^(and|of|the|a|an)$/i.test(word)) return word.toLowerCase();
  if (word.length <= 6 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
  if (/[A-Z]/.test(word.slice(1))) return word;
  return capitalize(word);
}

function presentCompany(raw: string) {
  return raw
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 6 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
      if (/[A-Z]/.test(word.slice(1))) return word;
      return capitalize(word);
    })
    .join(" ");
}

function capitalize(word: string) {
  return word ? word[0]!.toUpperCase() + word.slice(1).toLowerCase() : word;
}

function isStopword(name: string) {
  return /^(the|a|an|and)$/i.test(name.trim());
}
