import { readPaymentUrl } from "@/shared/event/payment";
import type { EventPay, PaymentTally, StatementReport } from "@/shared/event/payment-label";
import { matchStatement, type StatementGuest } from "@/shared/event/statement-match";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isUuid } from "@/shared/services/attachment-api";
import { loadManageEvent } from "@/shared/services/event-manage";

export type { EventPay, PaymentTally, StatementReport };

export type PaymentCall =
  | { ok: true }
  | { ok: true; report: StatementReport }
  | { ok: false; status: number; error: string };

const CURRENCY = /^[A-Z]{3,8}$/;

function missingColumn(message: string, column: string): boolean {
  return new RegExp(column, "i").test(message) && /column|schema/i.test(message);
}

function readPrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return number;
}

const EMPTY_PAY: EventPay = { isPaid: false, paymentUrl: null, paymentNote: null, price: null, currency: "EUR" };

function readTiers(value: unknown): { price: number | null }[] {
  if (!Array.isArray(value)) return [];
  const tiers: { price: number | null }[] = [];
  for (const item of value) {
    if (item != null && typeof item === "object" && "price" in item) {
      tiers.push({ price: readPrice((item as { price: unknown }).price) });
      continue;
    }
    if (typeof item === "number" || typeof item === "string") tiers.push({ price: readPrice(item) });
  }
  return tiers;
}

function payFrom(row: {
  is_paid?: boolean | null;
  payment_url?: string | null;
  payment_note?: string | null;
  price?: number | string | null;
  currency?: string | null;
  price_tiers?: unknown;
}): EventPay {
  const tiers = readTiers(row.price_tiers);
  return {
    isPaid: row.is_paid === true,
    paymentUrl: row.payment_url?.trim() || null,
    paymentNote: row.payment_note?.trim() || null,
    price: readPrice(row.price),
    currency: (row.currency ?? "").trim().toUpperCase() || "EUR",
    ...(tiers.length > 0 ? { tiers } : {}),
  };
}

/** What the guest and the payment screen need. Missing new columns keep the old paid flag. */
export async function loadEventPay(eventId: string): Promise<EventPay> {
  const admin = createAdminSupabaseClient();
  const full = await admin
    .from("events")
    .select("is_paid, payment_url, payment_note, price, currency")
    .eq("id", eventId)
    .maybeSingle();
  if (full.error && missingColumn(full.error.message, "payment_note")) {
    const mid = await admin.from("events").select("is_paid, payment_url, price, currency").eq("id", eventId).maybeSingle();
    if (mid.error && (missingColumn(mid.error.message, "price") || missingColumn(mid.error.message, "currency"))) {
      const basic = await admin.from("events").select("is_paid, payment_url").eq("id", eventId).maybeSingle();
      if (basic.error || !basic.data) return EMPTY_PAY;
      return payFrom(basic.data as { is_paid?: boolean | null; payment_url?: string | null });
    }
    if (mid.error || !mid.data) return EMPTY_PAY;
    return payFrom(mid.data as { is_paid?: boolean | null; payment_url?: string | null; price?: number | string | null; currency?: string | null });
  }
  if (full.error && (missingColumn(full.error.message, "price") || missingColumn(full.error.message, "currency"))) {
    const basic = await admin.from("events").select("is_paid, payment_url").eq("id", eventId).maybeSingle();
    if (basic.error || !basic.data) return EMPTY_PAY;
    return payFrom(basic.data as { is_paid?: boolean | null; payment_url?: string | null });
  }
  if (full.error || !full.data) return EMPTY_PAY;
  return payFrom(full.data);
}

/** Preview price. A missing `price_tiers` column keeps the single price. */
export async function loadPreviewPay(eventId: string): Promise<EventPay> {
  const pay = await loadEventPay(eventId);
  const admin = createAdminSupabaseClient();
  const row = await admin.from("events").select("price_tiers").eq("id", eventId).maybeSingle();
  if (row.error || !row.data) return pay;
  const tiers = readTiers((row.data as { price_tiers?: unknown }).price_tiers);
  return tiers.length > 0 ? { ...pay, tiers } : pay;
}

type PaymentDraft = {
  isPaid: boolean;
  paymentUrl: string | null;
  paymentNote: string | null;
  price: number | null;
  currency: string;
};

function draftFrom(body: {
  isPaid?: unknown;
  howTo?: unknown;
  price?: unknown;
  currency?: unknown;
}): PaymentDraft | { error: string } {
  const isPaid = body.isPaid === true;
  const howTo = typeof body.howTo === "string" ? body.howTo.trim() : "";
  let paymentUrl: string | null = null;
  let paymentNote: string | null = null;
  if (isPaid && howTo) {
    const url = readPaymentUrl(howTo);
    if (url) {
      if (url.length > 2000) return { error: "That payment link is too long." };
      paymentUrl = url;
    } else if (howTo.length > 500) {
      return { error: "Keep the payment instructions shorter." };
    } else {
      paymentNote = howTo;
    }
  }
  let price: number | null = null;
  if (body.price != null && body.price !== "") {
    const number = typeof body.price === "number" ? body.price : Number(String(body.price).replace(",", "."));
    if (!Number.isFinite(number) || number < 0 || number > 1_000_000) return { error: "Enter a price." };
    price = Math.round(number * 100) / 100;
  }
  const currency = (typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "") || "EUR";
  if (!CURRENCY.test(currency)) return { error: "Use a currency code like EUR." };
  return { isPaid, paymentUrl, paymentNote, price, currency };
}

export async function saveEventPay(lookup: string, actorId: string, body: {
  isPaid?: unknown;
  howTo?: unknown;
  price?: unknown;
  currency?: unknown;
}): Promise<PaymentCall> {
  const access = await loadManageEvent(lookup, actorId, "payments");
  if (access.kind !== "ok") {
    return { ok: false, status: access.kind === "missing" ? 404 : 403, error: access.kind === "missing" ? "Event not found" : "Not allowed" };
  }
  const draft = draftFrom(body);
  if ("error" in draft) return { ok: false, status: 400, error: draft.error };

  const admin = createAdminSupabaseClient();
  const eventId = access.event.id;
  const write = (fields: Record<string, unknown>) => admin.from("events").update(fields).eq("id", eventId);
  const pair = (message: string) => /events_payment_pair_check|events_payment_url_http_check/i.test(message);

  let saved = await write({
    is_paid: draft.isPaid,
    payment_url: draft.paymentUrl,
    payment_note: draft.paymentNote,
    price: draft.price,
    currency: draft.currency,
  });
  if (saved.error && missingColumn(saved.error.message, "payment_note")) {
    const withoutNote = {
      is_paid: draft.isPaid,
      payment_url: draft.paymentNote ? null : draft.paymentUrl,
      price: draft.price,
      currency: draft.currency,
    };
    saved = await write(withoutNote);
    if (saved.error && (missingColumn(saved.error.message, "price") || missingColumn(saved.error.message, "currency"))) {
      const basic = await write({ is_paid: draft.isPaid, payment_url: withoutNote.payment_url });
      if (basic.error && !pair(basic.error.message)) throw new Error(basic.error.message);
    }
    if (draft.paymentNote) {
      return { ok: false, status: 409, error: "Plain-text payment instructions need the pay-code migration." };
    }
  }
  if (saved.error && (missingColumn(saved.error.message, "price") || missingColumn(saved.error.message, "currency"))) {
    const basic = await write({ is_paid: draft.isPaid, payment_url: draft.paymentUrl });
    if (basic.error) {
      if (pair(basic.error.message)) {
        return { ok: false, status: 409, error: "Paid entry without a link needs the updated payment rules." };
      }
      throw new Error(basic.error.message);
    }
    return { ok: false, status: 409, error: "Price and currency need the payment migration." };
  }
  if (saved.error) {
    if (pair(saved.error.message)) {
      return { ok: false, status: 409, error: "Paid entry without a link needs the updated payment rules." };
    }
    throw new Error(saved.error.message);
  }
  return { ok: true };
}

const CONFIRMED_SOURCES = new Set(["statement", "name", "manual"]);

/** Counts for the payment screen. Nothing here is stored on its own. */
export async function loadPaymentTally(eventId: string): Promise<PaymentTally> {
  const admin = createAdminSupabaseClient();
  const full = await admin.from("event_registrations").select("paid_status, paid_source").eq("event_id", eventId);
  let sourceKnown = true;
  let list: { paid_status?: string | null; paid_source?: string | null }[] = [];
  if (!full.error) {
    list = (full.data ?? []) as typeof list;
  } else if (missingColumn(full.error.message, "paid_source")) {
    sourceKnown = false;
    const mid = await admin.from("event_registrations").select("paid_status").eq("event_id", eventId);
    if (mid.error && missingColumn(mid.error.message, "paid_status")) {
      const basic = await admin.from("event_registrations").select("id").eq("event_id", eventId);
      if (basic.error) throw new Error(basic.error.message);
      const guests = (basic.data ?? []).length;
      return { guests, byCode: 0, byName: 0, notConfirmed: guests };
    }
    if (mid.error) throw new Error(mid.error.message);
    list = (mid.data ?? []) as typeof list;
  } else if (missingColumn(full.error.message, "paid_status")) {
    const basic = await admin.from("event_registrations").select("id").eq("event_id", eventId);
    if (basic.error) throw new Error(basic.error.message);
    const guests = (basic.data ?? []).length;
    return { guests, byCode: 0, byName: 0, notConfirmed: guests };
  } else {
    throw new Error(full.error.message);
  }
  let byCode = 0;
  let byName = 0;
  let confirmed = 0;
  for (const row of list) {
    const status = row.paid_status ?? null;
    const source = row.paid_source ?? null;
    if (!sourceKnown) {
      if (status === "paid") confirmed += 1;
      continue;
    }
    if (status === "paid" && source === "statement") byCode += 1;
    if (status === "paid" && source === "name") byName += 1;
    if (status === "paid" && source != null && CONFIRMED_SOURCES.has(source)) confirmed += 1;
  }
  return { guests: list.length, byCode, byName, notConfirmed: list.length - confirmed };
}

/**
 * The guest says they paid — the return URL, or the button on their badge.
 * A confirmed row stays confirmed.
 */
export async function markPaidFromReturn(eventId: string, userId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const updated = await admin
    .from("event_registrations")
    .update({ paid_status: "paid", paid_source: "return" })
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .or("paid_source.is.null,paid_source.eq.return")
    .select("id");
  if (updated.error && missingColumn(updated.error.message, "paid_source")) {
    const basic = await admin
      .from("event_registrations")
      .update({ paid_status: "paid" })
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .select("id");
    if (basic.error) throw new Error(basic.error.message);
    return (basic.data ?? []).length > 0;
  }
  if (updated.error) throw new Error(updated.error.message);
  if ((updated.data ?? []).length > 0) return true;
  const existing = await admin.from("event_registrations").select("id").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  return Boolean(existing.data);
}

export async function markGuestPaid(lookup: string, actorId: string, guestId: string, paid: boolean): Promise<PaymentCall> {
  if (!isUuid(guestId)) return { ok: false, status: 404, error: "Guest not found" };
  const access = await loadManageEvent(lookup, actorId, "payments");
  if (access.kind !== "ok") {
    return { ok: false, status: access.kind === "missing" ? 404 : 403, error: access.kind === "missing" ? "Event not found" : "Not allowed" };
  }
  const admin = createAdminSupabaseClient();
  const updated = await admin
    .from("event_registrations")
    .update(paid ? { paid_status: "paid", paid_source: "manual" } : { paid_status: "unpaid", paid_source: null })
    .eq("event_id", access.event.id)
    .eq("user_id", guestId)
    .select("id");
  if (updated.error) throw new Error(updated.error.message);
  if (!(updated.data ?? []).length) return { ok: false, status: 404, error: "Guest not found" };
  return { ok: true };
}

function parseCsv(text: string, delimiter: "," | ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function tableFrom(text: string): string[][] {
  const sample = text.slice(0, 4000);
  const delimiter = (sample.match(/;/g) ?? []).length > (sample.match(/,/g) ?? []).length ? ";" : ",";
  return parseCsv(text, delimiter);
}

function guestName(value: string | null | undefined): string {
  const name = (value ?? "").trim();
  return name || "Untitled";
}

/** Rows already joined into lines. The file itself is not stored. */
export async function importPaymentStatement(lookup: string, actorId: string, lines: string[]): Promise<PaymentCall> {
  const access = await loadManageEvent(lookup, actorId, "payments");
  if (access.kind !== "ok") {
    return { ok: false, status: access.kind === "missing" ? 404 : 403, error: access.kind === "missing" ? "Event not found" : "Not allowed" };
  }
  const admin = createAdminSupabaseClient();
  const eventId = access.event.id;
  const pay = await loadEventPay(eventId);

  let sourceKnown = true;
  let codeKnown = true;
  type RegPayRow = {
    user_id: string;
    card_id: string;
    pay_code?: string | null;
    paid_status?: string | null;
    paid_source?: string | null;
  };
  let registrations: RegPayRow[] = [];
  const full = await admin
    .from("event_registrations")
    .select("user_id, card_id, pay_code, paid_status, paid_source")
    .eq("event_id", eventId);
  if (!full.error) {
    registrations = (full.data ?? []) as RegPayRow[];
  } else if (missingColumn(full.error.message, "pay_code")) {
    codeKnown = false;
    const mid = await admin.from("event_registrations").select("user_id, card_id, paid_status, paid_source").eq("event_id", eventId);
    if (!mid.error) {
      registrations = (mid.data ?? []) as RegPayRow[];
    } else if (missingColumn(mid.error.message, "paid_source")) {
      sourceKnown = false;
      const statusOnly = await admin.from("event_registrations").select("user_id, card_id, paid_status").eq("event_id", eventId);
      if (statusOnly.error) throw new Error(statusOnly.error.message);
      registrations = (statusOnly.data ?? []) as RegPayRow[];
    } else {
      throw new Error(mid.error.message);
    }
  } else if (missingColumn(full.error.message, "paid_source") || missingColumn(full.error.message, "paid_status")) {
    sourceKnown = false;
    codeKnown = false;
    const basic = await admin.from("event_registrations").select("user_id, card_id").eq("event_id", eventId);
    if (basic.error) throw new Error(basic.error.message);
    registrations = (basic.data ?? []) as RegPayRow[];
  } else {
    throw new Error(full.error.message);
  }

  const cardIds = [...new Set(registrations.map((row) => row.card_id))];
  const cards = cardIds.length
    ? await admin.from("cards").select("id, display_name").in("id", cardIds)
    : { data: [], error: null };
  if (cards.error) throw new Error(cards.error.message);
  const names = new Map(
    (cards.data ?? []).map((row) => {
      const card = row as { id: string; display_name: string | null };
      return [card.id, guestName(card.display_name)] as const;
    }),
  );

  const guests: StatementGuest[] = registrations.map((row) => ({
    userId: row.user_id,
    name: names.get(row.card_id) ?? "Untitled",
    payCode: codeKnown ? row.pay_code ?? null : null,
    paidStatus: row.paid_status ?? null,
    paidSource: sourceKnown ? row.paid_source ?? null : row.paid_status === "paid" ? "manual" : null,
  }));

  const match = matchStatement(lines, guests, pay.price);
  const stamp = async (userIds: string[], source: "statement" | "name") => {
    if (userIds.length === 0) return null;
    const stamped = await admin
      .from("event_registrations")
      .update({ paid_status: "paid", paid_source: source })
      .eq("event_id", eventId)
      .in("user_id", userIds)
      .or("paid_source.is.null,paid_source.eq.return");
    return stamped.error;
  };

  const codeError = await stamp(match.byCode, "statement");
  if (codeError) {
    if (/paid_source|check constraint/i.test(codeError.message)) {
      return { ok: false, status: 409, error: "Statement marks need the payment migration." };
    }
    throw new Error(codeError.message);
  }
  const nameError = await stamp(match.byName, "name");
  if (nameError) {
    if (/paid_source|check constraint/i.test(nameError.message)) {
      return { ok: false, status: 409, error: "Name marks need the pay-code migration." };
    }
    throw new Error(nameError.message);
  }

  return {
    ok: true,
    report: { byCode: match.byCode.length, byName: match.byName.length, notMatched: match.notMatched, notes: match.notes },
  };
}

/** CSV table rows, cells joined by a space. */
export function statementLinesFromCsv(text: string): string[] {
  return tableFrom(text)
    .map((cells) => cells.map((cell) => cell.trim()).filter(Boolean).join(" "))
    .filter(Boolean);
}
