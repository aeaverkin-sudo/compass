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

export function portfolioText(url: string) {
  return `We've just met. Here's my portfolio:\n${url}`;
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

/** Drop a trailing full stop so the subject does not read "Name.'s portfolio". */
export function subjectName(storedName: string): string {
  return storedName.trim().replace(/\.+$/g, "").trim();
}

export function meetingSubject(storedName: string): string {
  const name = subjectName(storedName);
  if (!name) return "We've just met. My portfolio.";
  return `We've just met. ${name}'s portfolio`;
}

/** The body never carries the name. The subject does, from the server's display name. */
export function portfolioBody(url: string) {
  return `Here's my portfolio:\n${url}`;
}

export function emailDraft(url: string, storedName: string): { subject: string; text: string } {
  return { subject: meetingSubject(storedName), text: portfolioBody(url) };
}

/** A private card is not offered. `listed` does not decide this. */
export function swapCardOffered(card: { displayName: string; status: string; isPublic?: boolean }): boolean {
  if (card.isPublic === false) return false;
  if (card.status === "archived" || card.status === "suspended") return false;
  return Boolean(card.displayName.trim());
}

/** A card that has left the Swap list is no longer selected. */
export function keptSwapCard(cardId: string | null, offeredIds: readonly string[]): string | null {
  if (!cardId || !offeredIds.includes(cardId)) return null;
  return cardId;
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

export type SwapReturn = {
  armed: boolean;
  left: boolean;
  blurredAt: number | null;
  armedAt: number;
};

/** A tap that is still focused after this did not open Mail, WhatsApp, or Telegram. */
export const SWAP_RETURN_ARM_MS = 700;
/** A blur this short is the tap itself, not the mail or messenger sheet. */
export const SWAP_RETURN_BLUR_MS = 400;

const SWAP_IDLE: SwapReturn = { armed: false, left: false, blurredAt: null, armedAt: 0 };

export function armSwapReturn(now: number): SwapReturn {
  return { armed: true, left: false, blurredAt: null, armedAt: now };
}

export function noteSwapHidden(state: SwapReturn): SwapReturn {
  if (!state.armed) return state;
  return { ...state, left: true };
}

export function noteSwapBlur(state: SwapReturn, now: number): SwapReturn {
  if (!state.armed || state.left || state.blurredAt !== null) return state;
  return { ...state, blurredAt: now };
}

/** Send and closing the draft are the same return: the other app had the screen, then ADED is back. */
export function finishSwapReturn(state: SwapReturn, now: number): { state: SwapReturn; openNetwork: boolean } {
  if (!state.armed) return { state, openNetwork: false };
  if (state.left) return { state: SWAP_IDLE, openNetwork: true };
  if (state.blurredAt !== null && now - state.blurredAt >= SWAP_RETURN_BLUR_MS) {
    return { state: SWAP_IDLE, openNetwork: true };
  }
  if (state.blurredAt !== null) return { state: { ...state, blurredAt: null }, openNetwork: false };
  return { state, openNetwork: false };
}

export function expireSwapReturn(state: SwapReturn, now: number, stillHere: boolean): SwapReturn {
  if (!state.armed || state.left || state.blurredAt !== null || !stillHere) return state;
  if (now - state.armedAt < SWAP_RETURN_ARM_MS) return state;
  return SWAP_IDLE;
}
