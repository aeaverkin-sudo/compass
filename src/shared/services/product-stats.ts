/**
 * Daily product totals. No names, contacts, visitor ids, or IP addresses.
 * Account and portfolio ids are stored only for a per-card total.
 */

export const PRODUCT_COUNT_RETENTION_DAYS = 90;

/**
 * Collection stays off while Privacy and the objection button go out.
 * Installing the SQL does not start writes. Turn this on only after that check.
 */
export const PRODUCT_COUNTS_ENABLED = false;

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
export type ObjectionRead = "guest" | "on" | "off" | "unknown";

export type ObjectionGet =
  | { status: 200; body: { signedIn: false } }
  | { status: 200; body: { objected: boolean } }
  | { status: 503; body: { error: string } };

/** No session is not a database answer. A failed read is not "this account has not objected". */
export function objectionGet(input: { signedIn: boolean; objected?: boolean; failed?: boolean }): ObjectionGet {
  if (!input.signedIn) return { status: 200, body: { signedIn: false } };
  if (input.failed || typeof input.objected !== "boolean") {
    return { status: 503, body: { error: "Could not read the objection." } };
  }
  return { status: 200, body: { objected: input.objected } };
}

export function objectionRead(ok: boolean, body: { objected?: unknown; signedIn?: unknown } | null): ObjectionRead {
  if (!ok || !body) return "unknown";
  if (body.signedIn === false) return "guest";
  if (typeof body.objected !== "boolean") return "unknown";
  return body.objected ? "on" : "off";
}

/** False only when the query succeeded and returned no row. Any Supabase error is a failure. */
export function objectedFromQuery(result: { error: { message: string } | null; data: unknown }): boolean {
  if (result.error) throw new Error(result.error.message);
  return result.data != null;
}

/** Confirm exists only after a signed-in read that returned objected: false. */
export function objectionConfirm(read: ObjectionRead | "loading"): boolean {
  return read === "off";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** The database adds one in a single statement. This process does not read and write the total. */
export function productCountBumpArgs(input: {
  action: CountAction;
  cardId?: string | null;
  ownerId?: string | null;
  now?: Date;
}): { p_day: string; p_action: CountAction; p_card_id: string | null; p_owner_id: string | null } | null {
  const scope = scopedProductCount(input.action, input.cardId, input.ownerId);
  if (!scope) return null;
  return {
    p_day: productCountDay(input.now),
    p_action: input.action,
    p_card_id: scope.card_id,
    p_owner_id: scope.owner_id,
  };
}
