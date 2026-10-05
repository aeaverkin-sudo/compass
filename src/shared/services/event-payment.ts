import type { EventPay } from "@/shared/event/payment-label";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isUuid } from "@/shared/services/attachment-api";
import { loadManageEvent } from "@/shared/services/event-manage";

export type { EventPay };

export type PaymentCall =
  | { ok: true }
  | { ok: true; matched: number; total: number; unmatched: string[] }
  | { ok: false; status: number; error: string };

const HTTP_URL = /^https?:\/\//i;
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

/** What the guest and the payment screen need. Missing new columns keep the old paid flag. */
export async function loadEventPay(eventId: string): Promise<EventPay> {
  const admin = createAdminSupabaseClient();
  const full = await admin
    .from("events")
    .select("is_paid, payment_url, price, currency, badge_gate")
    .eq("id", eventId)
    .maybeSingle();
  if (full.error && /price|currency|badge_gate/i.test(full.error.message) && /column|schema/i.test(full.error.message)) {
    const basic = await admin.from("events").select("is_paid, payment_url").eq("id", eventId).maybeSingle();
    if (basic.error || !basic.data) return { isPaid: false, paymentUrl: null, price: null, currency: "EUR", badgeGate: true };
    const row = basic.data as { is_paid?: boolean | null; payment_url?: string | null };
    return {
      isPaid: row.is_paid === true,
      paymentUrl: row.payment_url?.trim() || null,
      price: null,
      currency: "EUR",
      badgeGate: true,
    };
  }
  if (full.error || !full.data) return { isPaid: false, paymentUrl: null, price: null, currency: "EUR", badgeGate: true };
  const row = full.data as {
    is_paid?: boolean | null;
    payment_url?: string | null;
    price?: number | string | null;
    currency?: string | null;
    badge_gate?: boolean | null;
  };
  return {
    isPaid: row.is_paid === true,
    paymentUrl: row.payment_url?.trim() || null,
    price: readPrice(row.price),
    currency: (row.currency ?? "").trim().toUpperCase() || "EUR",
    badgeGate: row.badge_gate !== false,
  };
}

type PaymentDraft = {
  isPaid: boolean;
  paymentUrl: string | null;
  price: number | null;
  currency: string;
  badgeGate: boolean;
};

function draftFrom(body: {
  isPaid?: unknown;
  paymentUrl?: unknown;
  price?: unknown;
  currency?: unknown;
  badgeGate?: unknown;
}): PaymentDraft | { error: string } {
  const isPaid = body.isPaid === true;
  const rawUrl = typeof body.paymentUrl === "string" ? body.paymentUrl.trim() : "";
  if (isPaid && !rawUrl) return { error: "Add a pay link." };
  if (rawUrl && (!HTTP_URL.test(rawUrl) || rawUrl.length > 2000)) return { error: "The pay link needs to start with http:// or https://." };
  let price: number | null = null;
  if (body.price != null && body.price !== "") {
    const number = typeof body.price === "number" ? body.price : Number(String(body.price).replace(",", "."));
    if (!Number.isFinite(number) || number < 0 || number > 1_000_000) return { error: "Enter a price." };
    price = Math.round(number * 100) / 100;
  }
  const currency = (typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "") || "EUR";
  if (!CURRENCY.test(currency)) return { error: "Use a currency code like EUR." };
  return {
    isPaid,
    paymentUrl: isPaid ? rawUrl : null,
    price,
    currency,
    badgeGate: body.badgeGate !== false,
  };
}

export async function saveEventPay(lookup: string, actorId: string, body: {
  isPaid?: unknown;
  paymentUrl?: unknown;
  price?: unknown;
  currency?: unknown;
  badgeGate?: unknown;
}): Promise<PaymentCall> {
  const access = await loadManageEvent(lookup, actorId, "payments");
  if (access.kind !== "ok") {
    return { ok: false, status: access.kind === "missing" ? 404 : 403, error: access.kind === "missing" ? "Event not found" : "Not allowed" };
  }
  const draft = draftFrom(body);
  if ("error" in draft) return { ok: false, status: 400, error: draft.error };

  const admin = createAdminSupabaseClient();
  const row = {
    is_paid: draft.isPaid,
    payment_url: draft.paymentUrl,
    price: draft.price,
    currency: draft.currency,
    badge_gate: draft.badgeGate,
  };
  const saved = await admin.from("events").update(row).eq("id", access.event.id);
  if (saved.error && (missingColumn(saved.error.message, "price") || missingColumn(saved.error.message, "currency") || missingColumn(saved.error.message, "badge_gate"))) {
    const basic = await admin
      .from("events")
      .update({ is_paid: draft.isPaid, payment_url: draft.paymentUrl })
      .eq("id", access.event.id);
    if (basic.error) throw new Error(basic.error.message);
    return { ok: false, status: 409, error: "Price, currency, and the badge gate need the payment migration." };
  }
  if (saved.error) {
    if (/events_payment_pair_check|events_payment_url_http_check/i.test(saved.error.message)) {
      return { ok: false, status: 400, error: "Add a pay link." };
    }
    throw new Error(saved.error.message);
  }
  return { ok: true };
}

/**
 * A logged-in guest opened the return URL. We mark them paid.
 * MVP: this does not prove the money moved. The CSV statement is the check.
 */
export async function markPaidFromReturn(eventId: string, userId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const updated = await admin
    .from("event_registrations")
    .update({ paid_status: "paid", paid_source: "return" })
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .select("id");
  if (updated.error) throw new Error(updated.error.message);
  return (updated.data ?? []).length > 0;
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

async function emailByUser(userIds: string[]): Promise<Map<string, string>> {
  const admin = createAdminSupabaseClient();
  const emails = new Map<string, string>();
  await Promise.all(
    userIds.map(async (userId) => {
      const user = await admin.auth.admin.getUserById(userId);
      const email = user.data.user?.email?.trim().toLowerCase();
      if (email) emails.set(email, userId);
    }),
  );
  return emails;
}

export async function importPaymentStatement(lookup: string, actorId: string, text: string): Promise<PaymentCall> {
  const access = await loadManageEvent(lookup, actorId, "payments");
  if (access.kind !== "ok") {
    return { ok: false, status: access.kind === "missing" ? 404 : 403, error: access.kind === "missing" ? "Event not found" : "Not allowed" };
  }
  if (text.length > 1_000_000) return { ok: false, status: 400, error: "That file is too large." };
  const table = tableFrom(text);
  const header = table[0] ?? [];
  const column = header.findIndex((cell) => /email/i.test(cell));
  if (column < 0) return { ok: false, status: 400, error: "The file needs an email column." };

  const emails: string[] = [];
  for (const cells of table.slice(1)) {
    const email = (cells[column] ?? "").trim();
    if (email) emails.push(email);
  }
  const admin = createAdminSupabaseClient();
  const registrations = await admin.from("event_registrations").select("user_id").eq("event_id", access.event.id);
  if (registrations.error) throw new Error(registrations.error.message);
  const userIds = [...new Set((registrations.data ?? []).map((row) => String((row as { user_id: string }).user_id)))];
  const known = await emailByUser(userIds);

  const unmatched: string[] = [];
  const hit = new Set<string>();
  for (const email of emails) {
    const userId = known.get(email.toLowerCase());
    if (!userId) {
      unmatched.push(email);
      continue;
    }
    hit.add(userId);
  }
  if (hit.size > 0) {
    const stamped = await admin
      .from("event_registrations")
      .update({ paid_status: "paid", paid_source: "statement" })
      .eq("event_id", access.event.id)
      .in("user_id", [...hit]);
    if (stamped.error) {
      if (/paid_source|check constraint/i.test(stamped.error.message)) {
        return { ok: false, status: 409, error: "Statement marks need the payment migration." };
      }
      throw new Error(stamped.error.message);
    }
  }
  return { ok: true, matched: emails.length - unmatched.length, total: emails.length, unmatched };
}
