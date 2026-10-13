import type { GuestBook } from "@/shared/event/guest-book";
import { guestStatusView } from "@/shared/event/guest-book";
import { isPaidGuest, isPendingGuest, sourceIds, sourceNames } from "@/shared/event/guest-sources";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

function cell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  const formula = /^[=+\-@\t\r]/.test(text) && !/^\+[\d\s().-]+$/.test(text);
  const safe = formula ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csv(rows: (string | number | null | undefined)[][]): string {
  return `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

export function csvFileName(eventName: string, suffix: string): string {
  const base = eventName.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "event";
  return `${base}-${suffix}.csv`;
}

/** One row per guest: name, email, phone, sources, status, payment, check-in, registration time. */
export function guestsCsv(book: GuestBook, isPaid: boolean): string {
  const rows: (string | null)[][] = [["Name", "Email", "Phone", "Sources", "Status", "Payment", "Checked in", "Registered"]];
  for (const guest of book.guests) {
    rows.push([
      guest.name,
      guest.email,
      guest.phone,
      sourceNames(guest, book.lists).join("; "),
      guestStatusView(guest.status).label,
      !isPaid ? "" : isPaidGuest(guest) ? "Paid" : isPendingGuest(guest) ? "Pending" : "",
      guest.status === "in" ? "Yes" : "",
      guest.registeredAt,
    ]);
  }
  return csv(rows);
}

export async function countCardsExchanged(eventId: string): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin.from("connections").select("id", { count: "exact", head: true }).eq("source_event_id", eventId);
  return error ? 0 : (count ?? 0);
}

export type EventReport = {
  endedOn: string;
  guests: number;
  came: number;
  cards: number;
  paid: number | null;
  pending: number | null;
};

export function eventReportFigures(book: GuestBook, isPaid: boolean, cards: number, endedOn: string): EventReport {
  return {
    endedOn,
    guests: book.total,
    came: book.checkedIn,
    cards,
    paid: isPaid ? book.guests.filter(isPaidGuest).length : null,
    pending: isPaid ? book.guests.filter(isPendingGuest).length : null,
  };
}

/** The After figures, then the same counts for each source. */
export function reportCsv(book: GuestBook, report: EventReport): string {
  const rows: (string | number | null)[][] = [
    ["Figure", "Value"],
    ["Ended", report.endedOn],
    ["Guests", report.guests],
    ["Came", report.came],
    ["Cards exchanged", report.cards],
  ];
  if (report.paid !== null) rows.push(["Paid", report.paid], ["Pending", report.pending]);
  rows.push([], ["Source", "Guests", "Going", "Came"]);
  const sources = new Map<string, { name: string; guests: number; going: number; came: number }>();
  for (const guest of book.guests) {
    const names = sourceNames(guest, book.lists);
    sourceIds(guest, book.lists).forEach((id, index) => {
      const row = sources.get(id) ?? { name: names[index], guests: 0, going: 0, came: 0 };
      row.guests += 1;
      if (guest.status === "going" || guest.status === "in") row.going += 1;
      if (guest.status === "in") row.came += 1;
      sources.set(id, row);
    });
  }
  for (const row of sources.values()) rows.push([row.name, row.guests, row.going, row.came]);
  return csv(rows);
}
