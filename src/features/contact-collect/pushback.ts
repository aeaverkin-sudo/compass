import { detectContactType } from "@/shared/services/contact-item";
import { messengerPhoneDigits, messengerUsername } from "@/shared/services/portfolio-catalog";
import type { ExternalLine, PushbackChannel } from "@/features/contact-collect/types";

export type PushTarget = {
  channel: PushbackChannel;
  label: "Email" | "WhatsApp" | "Telegram";
  /** What the row shows. */
  value: string;
  /** Email, WhatsApp digits, or a Telegram nick. */
  address: string;
};

function emailAddress(value: string): string | null {
  const trimmed = value.trim();
  if (detectContactType(trimmed) !== "email") return null;
  return trimmed;
}

/** A phone is WhatsApp only when the country code was typed. */
function whatsappDigits(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) return null;
  if (detectContactType(trimmed, "contact") !== "phone") return null;
  return messengerPhoneDigits(trimmed);
}

function telegramNick(value: string): string | null {
  const trimmed = value.trim();
  if (detectContactType(trimmed, "contact") !== "telegram") return null;
  const direct = messengerUsername(trimmed);
  if (direct) return direct;
  const at = trimmed.match(/@([A-Za-z][A-Za-z0-9_]*)/);
  if (at?.[1] && messengerUsername(at[1])) return at[1];
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "t.me" && host !== "telegram.me") return null;
    const head = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "");
    if (head.startsWith("+")) return null;
    return messengerUsername(head);
  } catch {
    return null;
  }
}

/** Email, a + phone, and a Telegram nick. One row each. A marked WhatsApp number wins over another + phone. */
export function pushTargets(lines: ExternalLine[]): PushTarget[] {
  const targets: PushTarget[] = [];
  const email = lines.find((line) => emailAddress(line.value));
  if (email) {
    const address = emailAddress(email.value)!;
    targets.push({ channel: "email", label: "Email", value: address, address });
  }
  const phones = lines.filter((line) => whatsappDigits(line.value));
  const phone = phones.find((line) => line.flags?.includes("wa")) ?? phones[0];
  if (phone) {
    const address = whatsappDigits(phone.value)!;
    targets.push({ channel: "whatsapp", label: "WhatsApp", value: phone.value.trim(), address });
  }
  const telegram = lines.find((line) => telegramNick(line.value));
  if (telegram) {
    const address = telegramNick(telegram.value)!;
    targets.push({ channel: "telegram", label: "Telegram", value: `@${address}`, address });
  }
  return targets;
}

export function pushAddress(lines: ExternalLine[], channel: PushbackChannel): string | null {
  return pushTargets(lines).find((target) => target.channel === channel)?.address ?? null;
}

export function portfolioText(name: string, url: string) {
  return `${name}\n${url}`;
}

export function whatsappLink(digits: string, text: string) {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Telegram does not take the text in the link. The text is copied, then this chat opens. */
export function telegramLink(nick: string) {
  return `https://t.me/${nick}`;
}
