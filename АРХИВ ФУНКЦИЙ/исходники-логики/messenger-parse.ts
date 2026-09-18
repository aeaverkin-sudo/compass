/** Shared handle rules for messenger profile links. */

export const TG_HANDLE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

export function formatPhoneDisplay(digits: string): string {
  const clean = digits.replace(/\D/g, "");
  if (clean.length <= 3) return `+${clean}`;
  return `+${clean}`;
}

/** t.me/username or telegram.me/username → @username + deep link. */
export function parseTelegram(raw: string): { display: string; url: string } | null {
  const v = raw.trim();
  if (!v) return null;

  try {
    const url = new URL(v.startsWith("http") ? v : `https://${v}`);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "t.me" && host !== "telegram.me") return null;
    const handle = url.pathname.split("/").filter(Boolean)[0];
    if (!handle || !TG_HANDLE.test(handle)) return null;
    return { display: `@${handle}`, url: `https://t.me/${handle}` };
  } catch {
    return null;
  }
}

/** wa.me/… or whatsapp.com/send?phone=… → WhatsApp deep link. */
export function parseWhatsApp(raw: string): { display: string; url: string } | null {
  const v = raw.trim();
  if (!v) return null;

  const waMe = v.match(/^(?:https?:\/\/)?(?:www\.)?wa\.me\/(\d{7,15})\/?(?:[?#].*)?$/i);
  if (waMe) {
    const digits = waMe[1];
    return { display: formatPhoneDisplay(digits), url: `https://wa.me/${digits}` };
  }

  try {
    const url = new URL(v.startsWith("http") ? v : `https://${v}`);
    if (!url.hostname.replace(/^www\./, "").includes("whatsapp.com")) return null;
    const phone = url.searchParams.get("phone")?.replace(/\D/g, "");
    if (!phone || phone.length < 7) return null;
    return { display: formatPhoneDisplay(phone), url: `https://wa.me/${phone}` };
  } catch {
    return null;
  }
}

export type ParsedMessenger =
  | { type: "instagram"; display: string; url: string }
  | { type: "telegram"; display: string; url: string }
  | { type: "whatsapp"; display: string; url: string };
