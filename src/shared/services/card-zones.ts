import type { ContactItem, ContactType } from "@/shared/types";
import { itemDisplayValue } from "./contact-item";
import { isAttachmentType } from "./portfolio-limits";
import { typeLabel } from "./portfolio-catalog";

export const CARD_ZONES = [
  { id: "web", title: "Web" },
  { id: "social", title: "Social" },
  { id: "files", title: "Files" },
  { id: "lifestyle", title: "Lifestyle" },
  { id: "position", title: "Position" },
  { id: "contact", title: "Contact" },
  { id: "additional", title: "Additional" },
] as const;

export type CardZoneId = (typeof CARD_ZONES)[number]["id"];

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

export function zoneForItem(item: ContactItem): CardZoneId {
  if (WEB_TYPES.has(item.type)) return "web";
  if (SOCIAL_TYPES.has(item.type)) return "social";
  if (isAttachmentType(item.type)) return "files";
  if (item.type === "spotify") return "lifestyle";
  if (CONTACT_TYPES.has(item.type)) return "contact";
  if (isExplicitPosition(item) || (item.type === "text" && parseDescription(item.value).position)) return "position";
  return "additional";
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

export function composeCard(items: ContactItem[]): { position: PositionLine | null; zones: CardZoneSection[] } {
  const buckets = new Map<CardZoneId, CardDisplayRow[]>();
  for (const item of items) pushDisplayed(buckets, item);
  return { position: null, zones: sectionsFrom(buckets) };
}

export function groupLibrary(items: ContactItem[]): CardZoneSection[] {
  const buckets = new Map<CardZoneId, CardDisplayRow[]>();
  for (const item of items) pushDisplayed(buckets, item);
  return sectionsFrom(buckets);
}

function pushDisplayed(buckets: Map<CardZoneId, CardDisplayRow[]>, item: ContactItem) {
  const split = splitPresentation(item);
  if (!split) return;
  const zone = zoneForItem(item);
  const rows = buckets.get(zone) ?? [];
  rows.push({
    key: item.id,
    item,
    axis: split.axis,
    value: split.value,
    url: item.url,
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

function sectionsFrom(buckets: Map<CardZoneId, CardDisplayRow[]>) {
  return CARD_ZONES.flatMap((zone) => {
    const rows = buckets.get(zone.id) ?? [];
    if (rows.length === 0) return [];
    return [{ id: zone.id, title: zone.title, rows }];
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
