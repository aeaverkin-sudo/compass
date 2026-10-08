import type { ContactItem, ContactType } from "@/shared/types";
import { itemDisplayValue } from "./contact-item";
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
  { id: "files", title: "Files" },
  { id: "lifestyle", title: "Lifestyle" },
  { id: "contact", title: "Contact" },
  { id: "additional", title: "Additional" },
] as const;

export type CardZoneId = (typeof CARD_ZONES)[number]["id"];

const ZONE_IDS = new Set<string>(CARD_ZONES.map((zone) => zone.id));

export type CardZoneScope = {
  rubricLabels?: Record<string, string>;
  itemZones?: Record<string, string>;
};

export function isCardZoneId(value: string): value is CardZoneId {
  return ZONE_IDS.has(value);
}

/** Shown heading. An empty override falls back to the built-in title. */
export function zoneTitle(card: CardZoneScope | null | undefined, zoneId: string, defaultTitle: string) {
  const custom = card?.rubricLabels?.[zoneId]?.trim();
  return custom || defaultTitle;
}

/** This card's section for the row. The item's own type stays where it is. */
export function effectiveZone(card: CardZoneScope | null | undefined, item: ContactItem): CardZoneId {
  const override = card?.itemZones?.[item.id];
  if (override && isCardZoneId(override)) return override;
  return zoneForItem(item);
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
  "github",
  "behance",
  "dribbble",
  "telegram",
  "whatsapp",
]);

const CONTACT_TYPES = new Set<ContactType>(["email", "phone"]);

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

const LEGAL_SUFFIX =
  /^(?:l\.?l\.?c\.?|inc\.?|incorporated|ltd\.?|limited|gmbh|corp\.?|corporation|llp|plc|ag|s\.?a\.?|sas|oy|ab|bv|nv|pty|lp|pllc|ug|kg|co\.?|company)$/i;

const FACT_LABELS: Record<string, CardZoneId> = {
  age: "age",
  education: "education",
  background: "background",
  experience: "background",
  location: "location",
  languages: "languages",
  language: "languages",
};

export function zoneForItem(item: ContactItem): CardZoneId {
  if (WEB_TYPES.has(item.type)) return "web";
  if (SOCIAL_TYPES.has(item.type)) return "social";
  if (isAttachmentType(item.type)) return "files";
  if (item.type === "spotify") return "lifestyle";
  if (CONTACT_TYPES.has(item.type)) return "contact";
  if (item.type === "text" && item.value.includes("\n")) return "additional";
  if (isExplicitPosition(item) || (item.type === "text" && parseDescription(item.value).position)) return "position";
  if (item.type === "text" && isCompanyLine(item.value)) return "company";
  if (item.type === "text") {
    const labeled = FACT_LABELS[item.label.trim().toLowerCase()];
    if (labeled) return labeled;
    const fact = factZone(item.value);
    if (fact) return fact;
  }
  if (item.type === "text" && isPersonName(item.value)) return "name";
  return "additional";
}

/**
 * A single portfolio line that is a fact, not a name or a role.
 * Age, study, work history, where they are, and which languages they speak.
 */
function factZone(text: string): CardZoneId | null {
  const line = text.trim();
  if (!line) return null;
  if (isAgeLine(line)) return "age";
  if (isEducationLine(line)) return "education";
  if (isBackgroundLine(line)) return "background";
  if (isLocationLine(line)) return "location";
  if (isLanguagesLine(line)) return "languages";
  return null;
}

function isAgeLine(text: string) {
  const aged = text.match(/^(?:age[d]?)\s*[:\-–]?\s*(\d{1,3})$/i);
  if (aged) return between(Number(aged[1]), 1, 120);
  const old = text.match(/^(\d{1,3})\s*(?:years?\s+old|y\.?o\.?)$/i);
  if (old) return between(Number(old[1]), 1, 120);
  const bare = text.match(/^(\d{2})$/);
  if (bare) return between(Number(bare[1]), 14, 99);
  return /^(?:born|b\.)\s+(?:in\s+)?(?:19|20)\d{2}$/i.test(text);
}

function isEducationLine(text: string) {
  if (
    /\b(?:education|university|college|bachelor(?:'s)?|master(?:'s)?|doctorate|phd|graduated|alumn(?:us|a|i)?|studied|degree|academy|conservatoire|conservatory|polytechnic|high\s+school|art\s+school)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  return /\b(?:BA|BS|BSc|BFA|MA|MS|MSc|MFA|MBA|PhD|DPhil)\b/.test(text);
}

function isBackgroundLine(text: string) {
  if (/\b(?:background|experience|career|r[eé]sum[eé]|worked|formerly)\b/i.test(text)) return true;
  if (/\b\d{1,2}\s+years?\s+(?:in|at|with|of)\b/i.test(text)) return true;
  if (/\b(?:since|from)\s+(?:19|20)\d{2}\b/i.test(text)) return true;
  return /^ex[-–]\p{L}/iu.test(text);
}

function isLocationLine(text: string) {
  if (/^(?:based|living|lives|located)\s+in\s+\p{L}/iu.test(text)) return true;
  return /^location\s*[:\-–]\s*\p{L}/iu.test(text);
}

const SPOKEN = new Set([
  "english",
  "russian",
  "portuguese",
  "spanish",
  "french",
  "german",
  "italian",
  "chinese",
  "mandarin",
  "cantonese",
  "japanese",
  "korean",
  "arabic",
  "hindi",
  "dutch",
  "swedish",
  "norwegian",
  "danish",
  "finnish",
  "polish",
  "ukrainian",
  "turkish",
  "greek",
  "hebrew",
  "czech",
  "hungarian",
  "romanian",
  "catalan",
  "indonesian",
  "thai",
  "vietnamese",
  "persian",
  "farsi",
  "urdu",
  "bengali",
  "swahili",
]);

function isLanguagesLine(text: string) {
  if (/^(?:languages?|speaks?)\b/i.test(text)) return true;
  const parts = text
    .split(/,|\/|&|\band\b/i)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return parts.length >= 2 && parts.every((part) => SPOKEN.has(part));
}

function between(value: number, min: number, max: number) {
  return value >= min && value <= max;
}

/** Position, name, or company row. A tap places that one line under the portfolio title. */
export function isChoosableHeader(item: ContactItem) {
  const zone = zoneForItem(item);
  return zone === "position" || zone === "name" || zone === "company";
}

function lineWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** A whole line that is a company, the way a role word marks a position. */
function isCompanyLine(text: string) {
  const words = lineWords(text);
  if (words.length === 0 || words.length > 6) return false;
  const last = words[words.length - 1]?.replace(/\.+$/, "") ?? "";
  return LEGAL_SUFFIX.test(last);
}

const NAME_PARTICLES = new Set([
  "van",
  "von",
  "de",
  "da",
  "di",
  "del",
  "della",
  "dei",
  "der",
  "den",
  "ten",
  "ter",
  "la",
  "le",
  "du",
  "dos",
  "das",
  "do",
  "bin",
  "ibn",
  "al",
  "el",
  "st",
  "saint",
  "оглы",
  "кызы",
  "заде",
]);

const NAME_HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir", "dame"]);

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** Words that make a line a note, not a given name plus a surname. */
const NOT_A_PERSON_NAME = new Set([
  "the",
  "and",
  "or",
  "for",
  "with",
  "from",
  "this",
  "that",
  "these",
  "those",
  "our",
  "your",
  "their",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "as",
  "new",
  "app",
  "we",
  "you",
  "it",
  "my",
  "his",
  "her",
  "its",
]);

type NameTokenKind = "honorific" | "suffix" | "particle" | "initial" | "name" | "junk";

/**
 * A whole line that is a person's name.
 * Needs a given name and a surname: two to four name words, an initial may stand in
 * for one of them. Particles (van, de, and the Turkic particles in the set), a leading title, and a trailing Jr/III
 * may sit around that pair. "Averkin, Anton" counts. A sentence does not.
 */
function isPersonName(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /[\d@/\\()[\]{}!?;&:#]/.test(trimmed)) return false;
  if ((trimmed.match(/,/g) ?? []).length > 1) return false;

  const words = lineWords(trimmed.replace(/,/g, " "));
  if (words.length < 2 || words.length > 7) return false;

  const allCapsLine = !/[\p{Ll}]/u.test(trimmed) && /[\p{Lu}]/u.test(trimmed);
  const kinds = words.map((word) => classifyNameToken(word, allCapsLine));

  let start = 0;
  let end = kinds.length;
  if (kinds[0] === "honorific") start = 1;
  if (end - start >= 2 && kinds[end - 1] === "suffix") end -= 1;

  const body = kinds.slice(start, end);
  if (body.length === 0) return false;

  let names = 0;
  let initials = 0;
  let particles = 0;
  for (const kind of body) {
    if (kind === "name") names += 1;
    else if (kind === "initial") initials += 1;
    else if (kind === "particle") particles += 1;
    else return false;
  }

  const parts = names + initials;
  return names >= 1 && parts >= 2 && parts <= 4 && particles <= 2;
}

function classifyNameToken(word: string, allCapsLine: boolean): NameTokenKind {
  const bare = word.replace(/\.+$/u, "");
  const lower = bare.toLocaleLowerCase();
  if (/^[\p{Lu}]\.?$/u.test(word)) return "initial";
  if (!lower || NOT_A_PERSON_NAME.has(lower)) return "junk";
  if (NAME_HONORIFICS.has(lower) && /^[\p{L}]+\.?$/u.test(word)) return "honorific";
  if (NAME_SUFFIXES.has(lower) && /^(?:jr|sr|ii|iii|iv)\.?$/iu.test(word)) return "suffix";
  if (isNameParticle(word, lower, allCapsLine)) return "particle";
  if (isTitleNameWord(bare) || isAllCapsNameWord(bare)) return "name";
  return "junk";
}

function isNameParticle(word: string, lower: string, allCapsLine: boolean) {
  if (!NAME_PARTICLES.has(lower)) return false;
  if (/^[\p{Ll}]+$/u.test(word)) return true;
  if (allCapsLine && /^[\p{Lu}]+\.?$/u.test(word)) return true;
  return (lower === "st" || lower === "saint") && /^[\p{Lu}][\p{Ll}]*\.?$/u.test(word);
}

/** Anton, McDonald, Anne-Marie, O'Brien, or a Cyrillic given name. */
function isTitleNameWord(word: string) {
  return /^(?:[\p{Lu}][\p{Ll}]*)(?:[\p{Lu}][\p{Ll}]*|['’-][\p{Lu}][\p{Ll}]*)*$/u.test(word) && word.length >= 2;
}

/** ANTON, AVERKIN, ANNE-MARIE. */
function isAllCapsNameWord(word: string) {
  return /^[\p{Lu}]{2,}(?:['’-][\p{Lu}]{2,})*$/u.test(word);
}

export function parseDescription(text: string): { position: PositionLine | null; remainders: string[] } {
  const source = text.trim();
  if (!source) return { position: null, remainders: [] };

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

export function groupLibrary(items: ContactItem[], scope?: CardZoneScope): CardZoneSection[] {
  const buckets = new Map<CardZoneId, CardDisplayRow[]>();
  for (const item of items) pushDisplayed(buckets, item, undefined, scope);
  return sectionsFrom(buckets, scope);
}

function pushDisplayed(
  buckets: Map<CardZoneId, CardDisplayRow[]>,
  item: ContactItem,
  publicToken?: string,
  scope?: CardZoneScope,
) {
  const split = splitPresentation(item);
  if (!split) return;
  const zone = effectiveZone(scope, item);
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

function splitPresentation(item: ContactItem): { axis: string; value: string } | null {
  const display = itemDisplayValue(item).trim();
  if (!display || display === "+") return null;
  const zone = zoneForItem(item);
  if (zone === "social" || zone === "lifestyle") return { axis: typeLabel(item.type), value: display };
  if (zone === "files") return { axis: FILE_AXIS[item.type] ?? "FILE", value: display };
  return { axis: "", value: display };
}

function sectionsFrom(buckets: Map<CardZoneId, CardDisplayRow[]>, scope?: CardZoneScope) {
  return CARD_ZONES.flatMap((zone) => {
    const rows = buckets.get(zone.id) ?? [];
    if (rows.length === 0) return [];
    return [{ id: zone.id, title: zoneTitle(scope, zone.id, zone.title), rows }];
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
    if (typeof entry !== "string" || !ZONE_IDS.has(entry) || keys.includes(entry)) continue;
    keys.push(entry);
  }
  return keys.length > 0 ? keys : undefined;
}

/** Keep known zone ids and a non-empty heading. */
export function normalizeRubricLabels(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const labels: Record<string, string> = {};
  for (const [zoneId, title] of Object.entries(value)) {
    if (!isCardZoneId(zoneId) || typeof title !== "string") continue;
    const trimmed = title.trim();
    if (!trimmed) continue;
    labels[zoneId] = trimmed;
  }
  return Object.keys(labels).length > 0 ? labels : undefined;
}

/** Keep overrides that name a real section. */
export function normalizeItemZones(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const zones: Record<string, string> = {};
  for (const [itemId, zoneId] of Object.entries(value)) {
    if (!itemId || typeof zoneId !== "string" || !isCardZoneId(zoneId)) continue;
    zones[itemId] = zoneId;
  }
  return Object.keys(zones).length > 0 ? zones : undefined;
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
