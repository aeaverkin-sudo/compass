export type GuestStatus = "not_sent" | "sent" | "opened" | "going" | "in" | "declined";

/** One person on the guests screen: a list guest, a shared-link registration, or both. */
export type BookGuest = {
  key: string;
  guestId: string | null;
  registrationId: string | null;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  token: string | null;
  listIds: string[];
  paidList: boolean;
  status: GuestStatus;
  /** The pass went out, and the guest opened it. */
  sent: boolean;
  opened: boolean;
  /** Resend reported a bounce or a complaint: no more mail. */
  bounced: boolean;
  unsubscribed: boolean;
  photoUrl: string | null;
  cardToken: string | null;
  paidStatus: string | null;
  paidSource: string | null;
  registeredAt: string | null;
  addedAt: string | null;
};

/** A file, or a system list: Added by hand and Open link. */
export type GuestListKind = "file" | "manual" | "open";

export type BookList = {
  id: string;
  name: string;
  kind: GuestListKind;
  isPaid: boolean;
  total: number;
  email: number;
  phone: number;
  going: number;
  preview: { key: string; name: string; status: GuestStatus }[];
};

export type PairSide = { id: string; name: string; contact: string; lists: string };
export type NamePair = { a: PairSide; b: PairSide };

export type GuestPass = { name: string; token: string };

export type GuestBook = {
  lists: BookList[];
  guests: BookGuest[];
  pairs: NamePair[];
  /** Phone-only guests: their links go out by hand. */
  passes: GuestPass[];
  total: number;
  going: number;
  checkedIn: number;
};

export type GuestListReport = {
  listId: string;
  name: string;
  added: number;
  merged: number;
  rows: number;
  skipped: { row: number; text: string }[];
};

const STATUS: Record<GuestStatus, { label: string; dot: string | null }> = {
  not_sent: { label: "Not sent", dot: null },
  sent: { label: "Sent", dot: null },
  opened: { label: "Opened", dot: "var(--pay-pending)" },
  going: { label: "Going", dot: "var(--pay-confirmed)" },
  in: { label: "In", dot: "var(--pay-confirmed)" },
  declined: { label: "Not going", dot: null },
};

export function guestStatusView(status: GuestStatus): { label: string; dot: string | null } {
  return STATUS[status];
}

export function isGoing(status: GuestStatus): boolean {
  return status === "going" || status === "in";
}

/** The personal link. `g` is read by the pass flow; until then the invite ignores it. */
export function guestPassUrl(inviteUrl: string, token: string): string {
  const joiner = inviteUrl.includes("?") ? "&" : "?";
  return `${inviteUrl}${joiner}g=${encodeURIComponent(token)}`;
}

export function whatsappHref(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function whatsappInvite(name: string, eventName: string, link: string): string {
  return `Hi ${name}, you're invited to ${eventName}. Your pass: ${link}`;
}
