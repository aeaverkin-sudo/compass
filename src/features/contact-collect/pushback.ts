import { detectContactType } from "@/shared/services/contact-item";
import { messengerPhoneDigits, messengerUsername } from "@/shared/services/portfolio-catalog";
import type { ExternalLine, PushbackChannel } from "@/features/contact-collect/types";

export type PushTarget = {
  channel: PushbackChannel;
  label: "Email" | "WhatsApp" | "Telegram";
  /** What the row shows. */
  value: string;
  /** Email, WhatsApp digits, or a Telegram nick or +number. */
  address: string;
};

function emailAddress(value: string): string | null {
  const trimmed = value.trim();
  if (detectContactType(trimmed) !== "email") return null;
  return trimmed;
}

/** Messenger phone links require an explicit international number. */
function internationalPhoneDigits(value: string): string | null {
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

/** One row per channel. Prefer a marked WhatsApp number and an explicit Telegram nick. */
export function pushTargets(lines: ExternalLine[]): PushTarget[] {
  const targets: PushTarget[] = [];
  const email = lines.find((line) => emailAddress(line.value));
  if (email) {
    const address = emailAddress(email.value)!;
    targets.push({ channel: "email", label: "Email", value: address, address });
  }
  const phones = lines.filter((line) => internationalPhoneDigits(line.value));
  const phone = phones.find((line) => line.flags?.includes("wa")) ?? phones[0];
  if (phone) {
    const address = internationalPhoneDigits(phone.value)!;
    targets.push({ channel: "whatsapp", label: "WhatsApp", value: phone.value.trim(), address });
  }
  const telegram = lines.find((line) => telegramNick(line.value));
  if (telegram) {
    const address = telegramNick(telegram.value)!;
    targets.push({ channel: "telegram", label: "Telegram", value: `@${address}`, address });
  } else {
    const telegramPhone = phones.find((line) => line.flags?.includes("tg"));
    if (telegramPhone) {
      const address = `+${internationalPhoneDigits(telegramPhone.value)!}`;
      targets.push({ channel: "telegram", label: "Telegram", value: telegramPhone.value.trim(), address });
    }
  }
  return targets;
}

export function pushAddress(lines: ExternalLine[], channel: PushbackChannel): string | null {
  return pushTargets(lines).find((target) => target.channel === channel)?.address ?? null;
}

export function portfolioText(name: string, url: string) {
  return `${name}\n${url}`;
}

/** The guest can open this card. `listed` is not what makes it public. */
export function pushCardIsServed(row: {
  is_public: boolean;
  status: string;
  display_name: string | null;
}): boolean {
  if (!row.is_public) return false;
  if (row.status === "archived" || row.status === "suspended") return false;
  return Boolean(row.display_name?.trim());
}

export const PORTFOLIO_SUBJECT = "My portfolio";

/** Neutral draft. A display name is not used until the owner has confirmed it. */
export function portfolioBody(url: string) {
  return `Here's my portfolio:\n${url}`;
}

/**
 * Email only. The name is the server's display name, and only when it is exactly
 * the name the owner just confirmed. Any other seen name stays the neutral draft.
 */
export function emailDraft(url: string, storedName: string, seenName: string | null): { subject: string; text: string } {
  const stored = storedName.trim();
  const seen = seenName?.trim() ?? "";
  if (stored && seen === stored) {
    return {
      subject: `${stored} \u2014 portfolio`,
      text: `Hi, I\u2019m ${stored}. Here\u2019s my portfolio:\n${url}`,
    };
  }
  return { subject: PORTFOLIO_SUBJECT, text: portfolioBody(url) };
}

/** A private card is not offered. `listed` does not decide this. */
export function swapCardOffered(card: { displayName: string; status: string; isPublic?: boolean }): boolean {
  if (card.isPublic === false) return false;
  if (card.status === "archived" || card.status === "suspended") return false;
  return Boolean(card.displayName.trim());
}

export type DraftChoice = {
  contactId: string;
  cardId: string;
  channel: string;
  name: string;
};

/**
 * One recipient, subject, and body. The address keeps its @. Header fields are encoded on their own.
 * A comma, a second header, or a control character is rejected.
 */
export function mailtoHref(address: string, subject: string, body: string): string | null {
  const to = address.trim();
  if (!to || to.length > 320) return null;
  if (/[\u0000-\u0020\u007F]/.test(to)) return null;
  if (/[,;?&#<>()[\]\\"]/.test(to)) return null;
  if ((to.match(/@/g) ?? []).length !== 1) return null;
  const [local, domain] = to.split("@");
  if (!local || !domain || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null;
  if (to.includes("%")) return null;
  const safeSubject = subject.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  const safeBody = body.replace(/\r\n|\r|\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (!safeSubject || !safeBody) return null;
  const encodedBody = encodeURIComponent(safeBody.replace(/\n/g, "\r\n"));
  return `mailto:${to}?subject=${encodeURIComponent(safeSubject)}&body=${encodedBody}`;
}

/** A prepared draft belongs only to the selection that asked for it, including the confirmed name. */
export function draftStillCurrent(started: DraftChoice, current: DraftChoice | null): boolean {
  if (!current) return false;
  return (
    started.contactId === current.contactId &&
    started.cardId === current.cardId &&
    started.channel === current.channel &&
    started.name === current.name
  );
}

/** Hide a draft that was already on screen as soon as the selection changes. */
export function visibleDraft<T extends DraftChoice>(draft: T | null, current: DraftChoice): T | null {
  if (!draft || !draftStillCurrent(draft, current)) return null;
  return draft;
}

export function whatsappLink(digits: string, text: string) {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function telegramLink(address: string, text?: string) {
  return `https://t.me/${address}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
