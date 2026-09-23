import type { ContactItem, ContactType } from "@/shared/types";
import { typeLabel } from "@/shared/services/portfolio-catalog";
import { isAttachmentType } from "@/shared/services/portfolio-limits";

const RESERVED = new Set([
  "about",
  "accounts",
  "addstickers",
  "album",
  "apps",
  "artist",
  "c",
  "channel",
  "company",
  "compose",
  "dialog",
  "direct",
  "discover",
  "episode",
  "events",
  "explore",
  "features",
  "foryou",
  "following",
  "groups",
  "hashtag",
  "home",
  "i",
  "in",
  "intent",
  "iv",
  "joinchat",
  "legal",
  "live",
  "login",
  "marketplace",
  "messages",
  "music",
  "p",
  "pages",
  "people",
  "photo",
  "photos",
  "playlist",
  "posts",
  "pricing",
  "privacy",
  "profile.php",
  "proxy",
  "pub",
  "reel",
  "reels",
  "s",
  "search",
  "settings",
  "share",
  "sharer",
  "shorts",
  "show",
  "signup",
  "socks",
  "sponsors",
  "status",
  "stories",
  "tag",
  "topics",
  "tos",
  "track",
  "user",
  "videos",
  "watch",
  "www",
]);

const PATH_LABELS: Record<string, string> = {
  album: "Album",
  artist: "Artist",
  episode: "Episode",
  p: "Post",
  playlist: "Playlist",
  reel: "Reel",
  reels: "Reel",
  shorts: "Short",
  show: "Show",
  status: "Story",
  stories: "Story",
  track: "Track",
  watch: "Video",
};

function sameLabel(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

/** User-typed name. A catalog platform title stored in `label` is not one. */
export function customDisplayName(item: ContactItem): string {
  const label = item.label.trim();
  if (!label || isAttachmentType(item.type)) return "";
  if (sameLabel(label, typeLabel(item.type))) return "";
  return label;
}

export function canRenameLinkDisplay(item: ContactItem): boolean {
  if (isAttachmentType(item.type) || item.type === "text" || item.type === "position") return false;
  return item.value.trim().length > 0 || item.url.trim().length > 0;
}

function parseHttp(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
    return null;
  }
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

function hostOf(url: URL) {
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

function domainFrom(raw: string) {
  const url = parseHttp(raw);
  if (!url) {
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split(/[/?#]/)[0];
  }
  return hostOf(url);
}

function segmentsOf(url: URL) {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function cleanHandle(segment: string): string | null {
  const id = segment.replace(/^@/, "").trim();
  if (!id || id.length > 30) return null;
  if (RESERVED.has(id.toLowerCase())) return null;
  if (!/^[\p{L}\p{N}._]+$/u.test(id)) return null;
  if (id.length >= 16 && /^[a-z0-9]+$/i.test(id)) return null;
  return id;
}

function isWhatsAppHost(host: string) {
  return host === "wa.me" || host === "whatsapp.com" || host.endsWith(".whatsapp.com");
}

function handleFrom(host: string, segments: string[]): string | null {
  if (host === "youtu.be") return null;

  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const at = segments.find((segment) => segment.startsWith("@"));
    if (at) return cleanHandle(at);
    const marker = segments.findIndex((segment) => segment.toLowerCase() === "c" || segment.toLowerCase() === "user");
    if (marker >= 0 && segments[marker + 1]) return cleanHandle(segments[marker + 1]);
    return null;
  }

  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    const marker = segments.findIndex((segment) => {
      const key = segment.toLowerCase();
      return key === "in" || key === "company";
    });
    if (marker >= 0 && segments[marker + 1]) return cleanHandle(segments[marker + 1]);
    return null;
  }

  const first = segments[0]?.toLowerCase();
  if (first && PATH_LABELS[first]) return null;

  for (const segment of segments) {
    const handle = cleanHandle(segment);
    if (!handle) continue;
    if (isWhatsAppHost(host) && !/^\d{6,15}$/.test(handle)) return null;
    return handle;
  }
  return null;
}

function pathLabel(segments: string[]) {
  for (const segment of segments) {
    const label = PATH_LABELS[segment.toLowerCase()];
    if (label) return label;
  }
  return null;
}

function source(item: ContactItem) {
  if (item.url.startsWith("http") || item.url.startsWith("mailto:") || item.url.startsWith("tel:")) return item.url;
  return item.value.trim();
}

function prettyLink(item: ContactItem, type: ContactType) {
  const raw = source(item);
  if (type === "website" || type === "appstore" || type === "playstore") return domainFrom(raw);

  const url = parseHttp(raw);
  if (!url) return raw.replace(/[?#].*$/, "");

  const host = hostOf(url);
  if (host === "youtu.be") return "Video";
  const segments = segmentsOf(url);
  const handle = handleFrom(host, segments);
  if (handle) {
    if (type === "whatsapp" || isWhatsAppHost(host)) return handle;
    return `@${handle}`;
  }
  return pathLabel(segments) ?? host;
}

/** Right-hand text. Never includes tracking query params. Does not change `item.url`. */
export function autoLinkDisplay(item: ContactItem): string {
  if (isAttachmentType(item.type)) {
    if (item.value.startsWith("data:")) return item.label.trim() || typeLabel(item.type);
    return item.value.trim() || item.label.trim() || typeLabel(item.type);
  }
  if (item.type === "email") return item.value.replace(/^mailto:/i, "").trim();
  if (item.type === "phone") return item.value.replace(/^tel:/i, "").trim();
  if (item.type === "text" || item.type === "position") return item.value.trim();
  if (!item.value.trim() && !item.url.trim()) return "";
  return prettyLink(item, item.type);
}

/** Chip, fill list, PDF, and the public card all use this string. */
export function linkDisplay(item: ContactItem): string {
  return customDisplayName(item) || autoLinkDisplay(item);
}
