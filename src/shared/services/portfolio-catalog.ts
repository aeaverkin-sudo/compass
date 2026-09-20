import type { ContactType } from "@/shared/types";
import type { AttachmentContactType } from "./portfolio-limits";

/**
 * Portfolio item catalog — what a Compass card can hold.
 *
 * Use cases: personal card, founder, freelancer, company, startup, SMB.
 * Detection fills the left label automatically; attachments infer label from filename when possible.
 */

export type PortfolioCategory =
  | "identity"
  | "contact"
  | "social"
  | "product"
  | "files"
  | "media";

export type CatalogEntry = {
  category: PortfolioCategory;
  type: ContactType;
  label: string;
  examples: string[];
};

/** Human-readable catalog for docs, tests, and future picker UI. */
export const PORTFOLIO_ITEM_CATALOG: CatalogEntry[] = [
  {
    category: "identity",
    type: "text",
    label: "Description",
    examples: [
      "Founder & CEO at Aded",
      "B2B SaaS for logistics",
      "Industrial design studio, Milan",
      "We build AI tools for clinics",
    ],
  },
  {
    category: "contact",
    type: "email",
    label: "Email",
    examples: ["hello@company.com", "invest@startup.io"],
  },
  {
    category: "contact",
    type: "phone",
    label: "Phone",
    examples: ["+1 415 555 0100", "+44 20 7946 0958"],
  },
  {
    category: "contact",
    type: "whatsapp",
    label: "WhatsApp",
    examples: ["wa.me/14155550100", "+1 415 555 0100"],
  },
  {
    category: "contact",
    type: "telegram",
    label: "Telegram",
    examples: ["t.me/handle", "@handle"],
  },
  {
    category: "social",
    type: "instagram",
    label: "Instagram",
    examples: ["@brand", "instagram.com/company"],
  },
  {
    category: "social",
    type: "linkedin",
    label: "LinkedIn",
    examples: ["linkedin.com/in/name", "linkedin.com/company/acme"],
  },
  {
    category: "social",
    type: "meta",
    label: "Meta",
    examples: ["facebook.com/page", "meta.com"],
  },
  {
    category: "social",
    type: "x",
    label: "X",
    examples: ["x.com/startup", "twitter.com/founder"],
  },
  {
    category: "social",
    type: "youtube",
    label: "YouTube",
    examples: ["youtube.com/@channel", "youtu.be/demo"],
  },
  {
    category: "social",
    type: "tiktok",
    label: "TikTok",
    examples: ["tiktok.com/@brand"],
  },
  {
    category: "social",
    type: "github",
    label: "GitHub",
    examples: ["github.com/org", "github.com/user/repo"],
  },
  {
    category: "social",
    type: "behance",
    label: "Behance",
    examples: ["behance.net/studio"],
  },
  {
    category: "social",
    type: "dribbble",
    label: "Dribbble",
    examples: ["dribbble.com/designer"],
  },
  {
    category: "social",
    type: "spotify",
    label: "Spotify",
    examples: ["open.spotify.com/show/…", "Podcast / audio show"],
  },
  {
    category: "product",
    type: "website",
    label: "Website",
    examples: ["company.com", "product.io/demo"],
  },
  {
    category: "product",
    type: "calendly",
    label: "Calendly",
    examples: ["calendly.com/founder/30min"],
  },
  {
    category: "product",
    type: "appstore",
    label: "App Store",
    examples: ["apps.apple.com/app/…"],
  },
  {
    category: "product",
    type: "playstore",
    label: "Google Play",
    examples: ["play.google.com/store/apps/…"],
  },
  {
    category: "files",
    type: "pdf",
    label: "PDF",
    examples: ["Pitch deck", "One-pager", "Brochure", "CV", "Price list", "Catalog", "Case study"],
  },
  {
    category: "files",
    type: "presentation",
    label: "Presentation",
    examples: ["Investor deck.pptx", "Product overview.key"],
  },
  {
    category: "files",
    type: "document",
    label: "Document",
    examples: ["Company profile.docx", "Press release", "Terms PDF excluded — use PDF type"],
  },
  {
    category: "files",
    type: "spreadsheet",
    label: "Spreadsheet",
    examples: ["Price list.xlsx", "SKU catalog.csv"],
  },
  {
    category: "files",
    type: "photo",
    label: "Photo",
    examples: ["Logo", "Product shot", "Team photo", "Office", "Certificate scan"],
  },
  {
    category: "media",
    type: "audio",
    label: "Audio",
    examples: ["Podcast clip.mp3", "Voice intro", "Radio ad"],
  },
  {
    category: "media",
    type: "video",
    label: "Video",
    examples: ["Product demo.mp4", "Founder intro (short)"],
  },
];

/**
 * Typed shortcut `service:handle` → contact type.
 * Example: `instagram:@radiomir`, `youtube:Toples`, `tiktok:brand`.
 */
export const SERVICE_PREFIX_ALIASES: Readonly<Record<string, ContactType>> = {
  instagram: "instagram",
  insta: "instagram",
  ig: "instagram",
  youtube: "youtube",
  yt: "youtube",
  tiktok: "tiktok",
  spotify: "spotify",
  linkedin: "linkedin",
  github: "github",
  x: "x",
  twitter: "x",
  meta: "meta",
  facebook: "meta",
  fb: "meta",
  telegram: "telegram",
  tg: "telegram",
  whatsapp: "whatsapp",
  wa: "whatsapp",
  behance: "behance",
  dribbble: "dribbble",
  calendly: "calendly",
};

const SKIP_PREFIXES = new Set(["http", "https", "mailto", "tel", "data"]);

export function matchServicePrefix(alias: string): ContactType | null {
  const key = alias.trim().toLowerCase();
  if (SKIP_PREFIXES.has(key)) return null;
  return SERVICE_PREFIX_ALIASES[key] ?? null;
}

/** Canonical profile / search URL for a typed handle. */
export function profileUrlForType(type: ContactType, handle: string): string | null {
  const id = handle.replace(/^@/, "").trim();
  if (!id) return null;

  switch (type) {
    case "instagram":
      return `https://instagram.com/${id}`;
    case "youtube":
      return `https://youtube.com/@${id}`;
    case "tiktok":
      return `https://tiktok.com/@${id}`;
    case "spotify":
      return `https://open.spotify.com/search/${encodeURIComponent(id)}`;
    case "linkedin":
      return `https://linkedin.com/in/${id}`;
    case "github":
      return `https://github.com/${id}`;
    case "x":
      return `https://x.com/${id}`;
    case "meta":
      return `https://facebook.com/${id}`;
    case "telegram":
      return `https://t.me/${id}`;
    case "whatsapp": {
      const digits = id.replace(/\D/g, "");
      return digits ? `https://wa.me/${digits}` : null;
    }
    case "behance":
      return `https://behance.net/${id}`;
    case "dribbble":
      return `https://dribbble.com/${id}`;
    case "calendly":
      return `https://calendly.com/${id}`;
    default:
      return null;
  }
}

export function displayHandleForType(type: ContactType, handle: string): string {
  const id = handle.replace(/^@/, "").trim();
  if (type === "instagram" || type === "tiktok" || type === "telegram" || type === "youtube") {
    return id ? `@${id}` : handle;
  }
  return id || handle;
}

/** Hostname (or suffix) → contact type for pasted URLs. Longest match wins. */
export const SOCIAL_DOMAIN_MAP: ReadonlyArray<[string, ContactType]> = [
  ["linkedin.com", "linkedin"],
  ["instagram.com", "instagram"],
  ["facebook.com", "meta"],
  ["fb.com", "meta"],
  ["meta.com", "meta"],
  ["twitter.com", "x"],
  ["x.com", "x"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["tiktok.com", "tiktok"],
  ["github.com", "github"],
  ["behance.net", "behance"],
  ["dribbble.com", "dribbble"],
  ["open.spotify.com", "spotify"],
  ["spotify.com", "spotify"],
  ["t.me", "telegram"],
  ["telegram.me", "telegram"],
  ["wa.me", "whatsapp"],
  ["whatsapp.com", "whatsapp"],
  ["calendly.com", "calendly"],
  ["apps.apple.com", "appstore"],
  ["play.google.com", "playstore"],
];

const MIME_TO_ATTACHMENT: ReadonlyArray<[string | RegExp, AttachmentContactType]> = [
  ["application/pdf", "pdf"],
  [/^image\//, "photo"],
  ["application/vnd.ms-powerpoint", "presentation"],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "presentation",
  ],
  ["application/msword", "document"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
  ["text/plain", "document"],
  ["application/rtf", "document"],
  ["application/vnd.ms-excel", "spreadsheet"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheet"],
  ["text/csv", "spreadsheet"],
  ["audio/mpeg", "audio"],
  ["audio/mp4", "audio"],
  ["audio/wav", "audio"],
  ["audio/x-wav", "audio"],
  ["video/mp4", "video"],
  ["video/quicktime", "video"],
];

const EXT_TO_ATTACHMENT: ReadonlyArray<[RegExp, AttachmentContactType]> = [
  [/\.pdf$/i, "pdf"],
  [/\.(png|jpe?g|gif|webp|heic|heif|svg)$/i, "photo"],
  [/\.(ppt|pptx|key)$/i, "presentation"],
  [/\.(doc|docx|txt|rtf)$/i, "document"],
  [/\.(xls|xlsx|csv)$/i, "spreadsheet"],
  [/\.(mp3|m4a|wav)$/i, "audio"],
  [/\.(mp4|mov|m4v)$/i, "video"],
];

/** Filename hints → display label (left column / PDF export). */
const FILENAME_LABEL_RULES: ReadonlyArray<[RegExp, string]> = [
  [/pitch|deck/i, "Pitch Deck"],
  [/one[-_]?pager/i, "One-pager"],
  [/brochure/i, "Brochure"],
  [/catalog|catalogue/i, "Catalog"],
  [/price|pricelist|pricing/i, "Price List"],
  [/case[-_]?study/i, "Case Study"],
  [/resume|cv/i, "CV"],
  [/press[-_]?kit/i, "Press Kit"],
  [/white[-_]?paper/i, "White Paper"],
  [/logo/i, "Logo"],
  [/product/i, "Product"],
  [/team/i, "Team"],
  [/demo/i, "Demo"],
  [/intro/i, "Intro"],
];

/** iOS — extension list avoids the Photo Library / Take Photo action sheet. */
export const PORTFOLIO_GALLERY_ACCEPT = ".jpg,.jpeg,.png,.heic,.heif,.webp";

/** Documents/media only — no image/* (images go through gallery picker). */
export const PORTFOLIO_FILE_ACCEPT = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "video/mp4",
  "video/quicktime",
  ".pdf",
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".mp3",
  ".m4a",
  ".wav",
  ".mp4",
  ".mov",
].join(",");

/** @deprecated Use PORTFOLIO_FILE_ACCEPT */
export const PORTFOLIO_DOCUMENT_ACCEPT = PORTFOLIO_FILE_ACCEPT;

export function detectAttachmentType(file: File): AttachmentContactType {
  for (const [mime, type] of MIME_TO_ATTACHMENT) {
    if (typeof mime === "string") {
      if (file.type === mime) return type;
    } else if (mime.test(file.type)) {
      return type;
    }
  }

  for (const [pattern, type] of EXT_TO_ATTACHMENT) {
    if (pattern.test(file.name)) return type;
  }

  if (file.type.startsWith("image/")) return "photo";
  return "document";
}

export function inferAttachmentLabel(type: AttachmentContactType, filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").trim();

  for (const [pattern, label] of FILENAME_LABEL_RULES) {
    if (pattern.test(base) || pattern.test(filename)) return label;
  }

  const defaults: Record<AttachmentContactType, string> = {
    pdf: "PDF",
    photo: "Photo",
    presentation: "Presentation",
    document: "Document",
    spreadsheet: "Spreadsheet",
    audio: "Audio",
    video: "Video",
  };

  return defaults[type];
}

export function matchSocialDomain(hostname: string): ContactType | null {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  for (const [domain, type] of SOCIAL_DOMAIN_MAP) {
    if (host === domain || host.endsWith(`.${domain}`)) return type;
  }
  return null;
}

export function typeLabel(type: ContactType): string {
  const fromCatalog = PORTFOLIO_ITEM_CATALOG.find((entry) => entry.type === type);
  if (fromCatalog) return fromCatalog.label;

  const fallback: Record<ContactType, string> = {
    instagram: "Instagram",
    linkedin: "LinkedIn",
    meta: "Meta",
    x: "X",
    youtube: "YouTube",
    tiktok: "TikTok",
    github: "GitHub",
    behance: "Behance",
    dribbble: "Dribbble",
    spotify: "Spotify",
    calendly: "Calendly",
    appstore: "App Store",
    playstore: "Google Play",
    website: "Website",
    email: "Email",
    phone: "Phone",
    pdf: "PDF",
    photo: "Photo",
    presentation: "Presentation",
    document: "Document",
    spreadsheet: "Spreadsheet",
    audio: "Audio",
    video: "Video",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    link: "Link",
    text: "Description",
    custom: "Link",
  };

  return fallback[type] ?? "Link";
}
