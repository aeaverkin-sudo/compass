import { detectContactType } from "@/shared/services/contact-item";
import { messengerUsername } from "@/shared/services/portfolio-catalog";

/** What a QR may put on the form. Nothing here writes a connection. */
export type ScannedContact = {
  name: string;
  lines: string[];
};

const NAME_MAX = 120;
const LINE_MAX = 300;

function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return "";
  return text;
}

function unescapeCard(value: string) {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function cardValue(value: string) {
  const text = unescapeCard(value).trim();
  if (/^tel:/i.test(text)) return text.replace(/^tel:/i, "").trim();
  if (/^mailto:/i.test(text)) return text.replace(/^mailto:/i, "").trim();
  return text;
}

function parseVCard(raw: string): ScannedContact | null {
  if (!/^BEGIN:VCARD/im.test(raw)) return null;
  const body = raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  let name = "";
  let structured = "";
  const lines: string[] = [];
  for (const row of body.split("\n")) {
    const split = row.indexOf(":");
    if (split < 0) continue;
    const head = row.slice(0, split).split(";")[0] ?? "";
    const key = head.split(".").pop()?.toUpperCase() ?? "";
    const value = cardValue(row.slice(split + 1));
    if (!value) continue;
    if (key === "FN" && !name) name = value;
    else if (key === "N" && !structured) structured = value;
    else if (key === "TEL" || key === "EMAIL") lines.push(value);
  }
  if (!name && structured) {
    const parts = structured.split(";");
    name = [parts[1], parts[0]].map((part) => part?.trim() ?? "").filter(Boolean).join(" ");
  }
  const kept = [...new Set(lines.map((line) => clip(line, LINE_MAX)).filter(Boolean))];
  const display = clip(name, NAME_MAX);
  if (!display && kept.length === 0) return null;
  return { name: display, lines: kept };
}

function asUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed);
    if (
      /^(?:www\.)?(?:t\.me|telegram\.me|wa\.me|whatsapp\.com|api\.whatsapp\.com|adedme\.com)(?:\/|$)/i.test(trimmed)
    ) {
      return new URL(`https://${trimmed.replace(/^www\./i, "")}`);
    }
  } catch {
    return null;
  }
  return null;
}

function linkLine(url: URL, raw: string) {
  const text = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : url.toString();
  const line = clip(text, LINE_MAX);
  return line ? { name: "", lines: [line] } : null;
}

/** `t.me/nick` becomes `@nick`. A phone link keeps the number. Anything else stays a link. */
function parseTelegram(raw: string): ScannedContact | null {
  const url = asUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "t.me" && host !== "telegram.me") return null;
  const parts = url.pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const head = parts[0] ?? "";
  if (parts.length === 1 && head.startsWith("+")) {
    const digits = head.slice(1).replace(/\D/g, "");
    const line = digits ? clip(`+${digits}`, LINE_MAX) : "";
    return line ? { name: "", lines: [line] } : null;
  }
  if (parts.length === 1) {
    const nick = messengerUsername(head);
    if (nick) return { name: "", lines: [`@${nick}`] };
  }
  return linkLine(url, raw);
}

/**
 * A WhatsApp QR is `wa.me/qr/…` and has no number, so it stays a link.
 * A `wa.me/<digits>` code does carry the number.
 */
function parseWhatsApp(raw: string): ScannedContact | null {
  const url = asUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const whatsapp = host === "wa.me" || host === "whatsapp.com" || host.endsWith(".whatsapp.com");
  if (!whatsapp) return null;
  if (host === "wa.me") {
    const parts = url.pathname.split("/").filter(Boolean);
    const head = parts[0] ?? "";
    if (head.toLowerCase() !== "qr" && parts.length === 1 && /^\d{8,15}$/.test(head)) {
      return { name: "", lines: [`+${head}`] };
    }
  }
  const phone = url.searchParams.get("phone")?.replace(/\D/g, "") ?? "";
  if (/^\d{8,15}$/.test(phone)) return { name: "", lines: [`+${phone}`] };
  return linkLine(url, raw);
}

function parseLink(raw: string): ScannedContact | null {
  const trimmed = raw.trim();
  const url = asUrl(trimmed);
  if (url) return linkLine(url, trimmed);
  if (detectContactType(trimmed, "web") !== "website") return null;
  const line = clip(trimmed, LINE_MAX);
  return line ? { name: "", lines: [line] } : null;
}

function parseOne(raw: string): ScannedContact | null {
  const trimmed = raw.trim();
  const kind = detectContactType(trimmed, "contact");
  if (kind !== "email" && kind !== "phone" && kind !== "telegram") return null;
  const line = clip(trimmed, LINE_MAX);
  return line ? { name: "", lines: [line] } : null;
}

/** Telegram nick, vCard name and lines, or a link. Null means point the camera again. */
export function parseContactQr(raw: string): ScannedContact | null {
  const text = raw.trim();
  if (!text || text.length > 8000) return null;
  return parseVCard(text) ?? parseTelegram(text) ?? parseWhatsApp(text) ?? parseLink(text) ?? parseOne(text);
}
