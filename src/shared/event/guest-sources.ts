import type { BookGuest, BookList, GuestListKind } from "@/shared/event/guest-book";
import { payView } from "@/shared/event/payment-label";

export const OPEN_LINK_SOURCE = "open";

/** A registration on no list came through the shared link. */
export function sourceIds(guest: BookGuest, lists: BookList[]): string[] {
  if (guest.listIds.length > 0) return guest.listIds;
  const open = lists.find((list) => list.kind === "open");
  return guest.registrationId ? [open?.id ?? OPEN_LINK_SOURCE] : [];
}

export function sourceLabel(kind: GuestListKind, name: string): string {
  if (kind === "manual") return "By hand";
  if (kind === "open") return "Open link";
  return name;
}

export function sourceNames(guest: BookGuest, lists: BookList[]): string[] {
  const byId = new Map(lists.map((list) => [list.id, list]));
  return sourceIds(guest, lists).map((id) => {
    const list = byId.get(id);
    return list ? sourceLabel(list.kind, list.name) : "Open link";
  });
}

export type GuestSource = {
  id: string;
  kind: GuestListKind;
  name: string;
  isPaid: boolean;
  total: number;
  email: number;
  phone: number;
};

/** Files first, then Added by hand, then Open link with the registrations on no list. */
export function guestSources(guests: BookGuest[], lists: BookList[]): GuestSource[] {
  const counts = new Map<string, BookGuest[]>();
  for (const guest of guests) {
    for (const id of sourceIds(guest, lists)) counts.set(id, [...(counts.get(id) ?? []), guest]);
  }
  const rows: GuestSource[] = lists.map((list) => {
    const inList = counts.get(list.id) ?? [];
    return {
      id: list.id,
      kind: list.kind,
      name: list.name,
      isPaid: list.isPaid,
      total: inList.length,
      email: inList.filter((guest) => guest.email).length,
      phone: inList.filter((guest) => !guest.email && guest.phone).length,
    };
  });
  const loose = counts.get(OPEN_LINK_SOURCE) ?? [];
  if (loose.length > 0) {
    rows.push({ id: OPEN_LINK_SOURCE, kind: "open", name: "Open link", isPaid: false, total: loose.length, email: 0, phone: 0 });
  }
  return rows.filter((row) => row.kind === "file" || row.total > 0);
}

export function isRegistered(guest: BookGuest): boolean {
  return Boolean(guest.registrationId) || Boolean(guest.paidStatus);
}

export function isPaidGuest(guest: BookGuest): boolean {
  return isRegistered(guest) && payView(guest.paidStatus ?? "", guest.paidSource).key === "confirmed";
}

export function isPendingGuest(guest: BookGuest): boolean {
  return isRegistered(guest) && !isPaidGuest(guest);
}
