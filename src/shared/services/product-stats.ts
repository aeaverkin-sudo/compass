/**
 * Daily product totals. No names, contacts, visitor ids, or IP addresses.
 * Account and portfolio ids are stored only for a per-card total.
 */

export const PRODUCT_COUNT_RETENTION_DAYS = 90;

const CARD_ACTIONS = ["share_link", "open_qr", "open_other"] as const;

export const COUNT_ACTIONS = [
  "registration_email",
  "registration_google",
  "registration_apple",
  "contact_manual",
  "contact_scan",
  "contact_voice",
  "contact_photo",
  "card_saved",
  "card_accepted",
  "share_link",
  "open_qr",
  "open_other",
] as const;

export type CountAction = (typeof COUNT_ACTIONS)[number];
export type RegistrationMethod = "email" | "google" | "apple";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProductCountRow = {
  day: string;
  action: CountAction;
  card_id: string | null;
  owner_id: string | null;
  total: number;
};

export type CountError = { code?: string; message?: string };

export type CountQuery = {
  eq(column: string, value: string): CountQuery;
  is(column: string, value: null): CountQuery;
  select(column: string): CountQuery;
  maybeSingle(): Promise<{ data: { total: number } | null; error: CountError | null }>;
};

export type CountClient = {
  from(table: string): {
    select(column: string): CountQuery;
    insert(row: ProductCountRow): Promise<{ error: CountError | null }>;
    update(row: { total: number }): CountQuery;
  };
};

export function productCountDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A row dated on this day is kept. Older rows are deleted. */
export function productCountCutoff(todayUtc: string, days = PRODUCT_COUNT_RETENTION_DAYS): string {
  const [year, month, day] = todayUtc.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** The sign-in method, only when the identities or the start of the sign-in name one provider. */
export function registrationMethod(asked: string | null, providers: readonly string[]): RegistrationMethod | null {
  const set = new Set(providers);
  if ((asked === "apple" || asked === "google") && (set.size === 0 || set.has(asked))) return asked;
  if (set.has("apple") && !set.has("google") && !set.has("email")) return "apple";
  if (set.has("google") && !set.has("apple") && !set.has("email")) return "google";
  if (set.has("email") && !set.has("google") && !set.has("apple")) return "email";
  return null;
}

/** A repeat sign-in is not a registration. An unclear method is not forced into a bucket. */
export function registrationCountAction(
  registeredAt: string | null | undefined,
  method: RegistrationMethod | null,
): CountAction | null {
  if (registeredAt || !method) return null;
  return `registration_${method}`;
}

export function contactCountAction(source: string): CountAction | null {
  if (source === "manual" || source === "scan" || source === "voice" || source === "photo") {
    return `contact_${source}`;
  }
  return null;
}

/** A new saved card, or a shared-back card the first time it is accepted. */
export function connectionCountAction(event: "saved" | "accepted"): CountAction {
  return event === "saved" ? "card_saved" : "card_accepted";
}

export function openCountAction(kind: "card_open" | "qr_open"): CountAction {
  return kind === "qr_open" ? "open_qr" : "open_other";
}

function cardScoped(action: CountAction): boolean {
  return (CARD_ACTIONS as readonly string[]).includes(action);
}

/** Card actions keep the card and its owner. Every other total stores neither. */
export function scopedProductCount(
  action: CountAction,
  cardId?: string | null,
  ownerId?: string | null,
): { card_id: string | null; owner_id: string | null } | null {
  if (!cardScoped(action)) return { card_id: null, owner_id: null };
  if (!cardId || !ownerId || !UUID.test(cardId) || !UUID.test(ownerId)) return null;
  return { card_id: cardId, owner_id: ownerId };
}

function missingTable(error: CountError | null): boolean {
  const message = error?.message ?? "";
  return /product_daily_counts/i.test(message) && /schema cache|does not exist|could not find/i.test(message);
}

async function readTotal(
  client: CountClient,
  day: string,
  action: CountAction,
  cardId: string | null,
): Promise<{ total: number } | null | "missing"> {
  let query = client.from("product_daily_counts").select("total").eq("day", day).eq("action", action);
  query = cardId ? query.eq("card_id", cardId) : query.is("card_id", null);
  const loaded = await query.maybeSingle();
  if (loaded.error) {
    if (missingTable(loaded.error)) return "missing";
    throw new Error(loaded.error.message);
  }
  return loaded.data;
}

/** Adds one to today's total. A card total without a card is ignored. */
export async function bumpProductCount(
  client: CountClient,
  input: { day: string; action: CountAction; cardId?: string | null; ownerId?: string | null },
): Promise<"added" | "ignored" | "missing"> {
  const scope = scopedProductCount(input.action, input.cardId, input.ownerId);
  if (!scope) return "ignored";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await readTotal(client, input.day, input.action, scope.card_id);
    if (current === "missing") return "missing";
    if (!current) {
      const inserted = await client.from("product_daily_counts").insert({
        day: input.day,
        action: input.action,
        card_id: scope.card_id,
        owner_id: scope.owner_id,
        total: 1,
      });
      if (!inserted.error) return "added";
      if (missingTable(inserted.error)) return "missing";
      if (inserted.error.code === "23505") continue;
      throw new Error(inserted.error.message);
    }
    let query = client
      .from("product_daily_counts")
      .update({ total: current.total + 1 })
      .eq("day", input.day)
      .eq("action", input.action)
      .eq("total", String(current.total));
    query = scope.card_id ? query.eq("card_id", scope.card_id) : query.is("card_id", null);
    const updated = await query.select("total").maybeSingle();
    if (updated.error) {
      if (missingTable(updated.error)) return "missing";
      throw new Error(updated.error.message);
    }
    if (updated.data) return "added";
  }
  return "ignored";
}
