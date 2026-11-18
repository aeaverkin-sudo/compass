import { detectContactType, startsWithServicePhrase } from "@/shared/services/contact-item";
import { isMapLink } from "@/shared/services/portfolio-catalog";

const WEB_LINE = new Set([
  "website",
  "link",
  "custom",
  "calendly",
  "appstore",
  "playstore",
  "behance",
  "dribbble",
  "vimeo",
  "github",
  "twitch",
  "soundcloud",
  "spotify",
  "applemusic",
]);

const SOCIAL_LINE = new Set([
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
  "behance",
  "dribbble",
  "vimeo",
  "github",
  "twitch",
  "soundcloud",
  "spotify",
  "applemusic",
]);

const CONTACT_LINE = new Set([
  "email",
  "telegram",
  "whatsapp",
  "viber",
  "signal",
  "messenger",
  "wechat",
  "line",
  "discord",
  "kakaotalk",
  "zalo",
]);

/** A phone in Contacts is 7 to 15 digits. + may only be first. */
function contactPhone(line: string) {
  if (!/^\+?[\d\s()-]+$/.test(line)) return false;
  const digits = line.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

/** `WhatsApp 912…` names a messenger and then a number with no country code. */
function messengerWithoutPlus(line: string) {
  const match = line.match(
    /^(?:telegram|tg|тг|whatsapp|wa|ватсап|вотсап|viber|вайбер|signal|wechat|weixin|line|discord|messenger|kakaotalk|kakao|zalo)\s+(.+)$/i,
  );
  if (!match?.[1]) return false;
  return /^[\d\s()-]+$/.test(match[1].trim());
}

/** A street line: plain text, two words, and a number or a comma. A service name is not a street. */
function contactAddress(line: string, type: string) {
  if (type !== "text" || startsWithServicePhrase(line)) return false;
  if (/^[\d\s()+-]+$/.test(line)) return false;
  const words = line.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 && (/\d/.test(line) || line.includes(","));
}

/** Latitude and longitude, split by a comma, spaces, or both. Out of range is still a pair. */
function coordinatePair(line: string): { lat: number; lon: number } | null {
  const match = line.match(/^(-?\d+(?:\.\d+)?)(?:\s*,\s*|\s+)(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function coordinatesOutOfRange(line: string): boolean | null {
  const pair = coordinatePair(line);
  if (!pair) return null;
  return pair.lat < -90 || pair.lat > 90 || pair.lon < -180 || pair.lon > 180;
}

/** A finished Contacts, Web, or Social line that breaks that section's rules. */
export function entryLineIsRed(zoneId: string, raw: string) {
  const line = raw.trim();
  if (!line) return false;
  if (zoneId !== "social" && zoneId !== "web" && zoneId !== "contact") return false;
  const type = detectContactType(line, zoneId);
  if (zoneId === "web") return !(WEB_LINE.has(type) || isMapLink(line));
  if (zoneId === "social") return !SOCIAL_LINE.has(type);
  if (messengerWithoutPlus(line)) return true;
  const coordinates = coordinatesOutOfRange(line);
  if (coordinates !== null) return coordinates;
  if (contactPhone(line) || CONTACT_LINE.has(type) || isMapLink(line) || contactAddress(line, type)) return false;
  return true;
}
