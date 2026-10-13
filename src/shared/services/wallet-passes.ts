import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventDayLong, formatEventRange } from "@/shared/event/when";
import { downloadAttachmentBytes, loadAttachment } from "@/shared/services/attachment-api";
import { loadEventInvite, type EventInvite } from "@/shared/services/event-invite";
import { loadOwnRegistration } from "@/shared/services/event-registration";
import { eventGuestEnd } from "@/shared/services/trial";
import { buildPass } from "@/shared/services/wallet-pass";
import { eventPassExpiry, guestPassBackFields, walletCardQr, type WalletBackField } from "@/shared/services/wallet-pass-content";

export type BuiltPass = { file: Buffer; name: string };

type CardRow = { id: string; display_name: string | null; title: string | null; public_token: string; handle?: string | null };

const PLACE_SECRET = "Revealed closer to the date";

/** A database without `handle` or `is_primary` still gives the card. */
async function readCards(ownerId: string, ids?: string[]): Promise<(CardRow & { is_primary?: boolean | null })[]> {
  const admin = createAdminSupabaseClient();
  const extras = ["handle", "is_primary"];
  for (;;) {
    let query = admin.from("cards").select(["id", "display_name", "title", "public_token", ...extras].join(", ")).eq("owner_id", ownerId);
    if (ids) query = query.in("id", ids);
    const loaded = await query;
    if (!loaded.error) return (loaded.data ?? []) as unknown as (CardRow & { is_primary?: boolean | null })[];
    const missing = extras.find((column) => new RegExp(column, "i").test(loaded.error.message));
    if (!missing) throw new Error(loaded.error.message);
    extras.splice(extras.indexOf(missing), 1);
  }
}

function cardQr(origin: string, card: CardRow): string {
  return walletCardQr(origin, { publicToken: card.public_token, handle: card.handle ?? undefined });
}

function cardName(card: CardRow | undefined): string {
  return card?.display_name?.replace(/\s+/g, " ").trim() || "Guest";
}

const LOGO_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

/** Wallet takes PNG: the logo is fitted whole inside 160×50 points, never cropped. Unreadable → the ADED icon. */
async function eventLogo(event: EventInvite): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer } | null> {
  if (!event.logoAttachmentId) return null;
  const row = await loadAttachment(event.logoAttachmentId);
  if (!row || row.status !== "ready" || !LOGO_MIMES.has(row.mime)) return null;
  const bytes = await downloadAttachmentBytes(row);
  if (!bytes) return null;
  try {
    const { default: sharp } = await import("sharp");
    const fit = (scale: number) =>
      sharp(Buffer.from(bytes), { failOn: "none", density: 300 })
        .rotate()
        .resize(160 * scale, 50 * scale, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
    const [x1, x2, x3] = await Promise.all([fit(1), fit(2), fit(3)]);
    return { x1, x2, x3 };
  } catch {
    return null;
  }
}

/** The guest account's deletion day, or null for a kept account. */
async function guestPurgeAt(userId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.from("profiles").select("event_trial, registered_at, purge_at").eq("id", userId).maybeSingle();
  const row = loaded.data as { event_trial?: boolean | null; registered_at?: string | null; purge_at?: string | null } | null;
  if (loaded.error || !row || row.event_trial !== true || row.registered_at) return null;
  return row.purge_at ?? null;
}

async function guestToken(registrationId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.from("event_guests").select("token").eq("registration_id", registrationId).limit(1).maybeSingle();
  return (loaded.data as { token?: string | null } | null)?.token ?? null;
}

function eventKey(event: { slug: string | null; code: string }): string {
  return encodeURIComponent(event.slug?.trim() || event.code);
}

/** The event badge: the guest's name, the date and place, the QR of the primary card. Null without a registration. */
export async function buildEventPass(lookup: string, userId: string, origin: string): Promise<BuiltPass | null> {
  const event = await loadEventInvite(lookup);
  if (!event) return null;
  const registration = await loadOwnRegistration(event.id, userId);
  if (!registration) return null;

  const cards = await readCards(userId);
  const registered = cards.find((card) => card.id === registration.cardId);
  const qrCard = cards.find((card) => card.is_primary === true) ?? registered;
  if (!qrCard) return null;

  const purgeAt = await guestPurgeAt(userId);
  const token = purgeAt ? await guestToken(registration.id) : null;
  const explore: WalletBackField = { key: "event", label: "Explore event", value: `${origin}/e/${eventKey(event)}` };
  const backFields: WalletBackField[] = token
    ? [...guestPassBackFields(origin, event, token), explore]
    : [
        { key: "portfolio", label: "Open my portfolio", value: cardQr(origin, registered ?? qrCard) },
        { key: "scan", label: "Scan a card", value: `${origin}/scan` },
        explore,
      ];

  const place = event.placeSecret ? PLACE_SECRET : event.place?.trim() || null;
  const when = formatEventRange(event.date, event.endsAt, event.timeZone);
  const day = eventDayLong(event.date, event.timeZone);
  const logo = await eventLogo(event);
  const file = await buildPass({
    style: "eventTicket",
    serialNumber: `event-${registration.id}`,
    organizationName: event.name,
    description: event.name,
    logo,
    logoText: logo ? undefined : event.name,
    header: day ? { key: "day", label: "Date", value: day } : null,
    primary: { key: "guest", label: "Guest", value: cardName(registered ?? qrCard) },
    secondary: [
      ...(when ? [{ key: "when", label: "When", value: when }] : []),
      ...(place ? [{ key: "place", label: "Place", value: place }] : []),
    ],
    backFields,
    barcodeMessage: cardQr(origin, qrCard),
    expiresAt: eventPassExpiry({ guestPurgeAt: purgeAt, eventEnd: eventGuestEnd({ date: event.date, endsAt: event.endsAt }) }),
  });
  return { file, name: event.name };
}

/** The guest's nearest event ahead, the one their pass card names. */
export async function nearestEventLookup(userId: string, now = Date.now()): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const regs = await admin.from("event_registrations").select("event_id").eq("user_id", userId);
  const ids = [...new Set(((regs.data ?? []) as { event_id: string }[]).map((row) => row.event_id))];
  if (regs.error || ids.length === 0) return null;
  const read = (columns: string) => admin.from("events").select(columns).in("id", ids);
  let loaded = await read("id, code, date, ends_at");
  if (loaded.error && /ends_at/i.test(loaded.error.message)) loaded = await read("id, code, date");
  if (loaded.error) return null;
  const rows = (loaded.data ?? []) as unknown as { code: string; date: string | null; ends_at?: string | null }[];
  const ranked = rows
    .map((row) => ({ code: row.code, end: eventGuestEnd({ date: row.date, endsAt: row.ends_at ?? null }, now) }))
    .sort((left, right) => left.end - right.end);
  return (ranked.find((row) => row.end > now) ?? ranked[ranked.length - 1])?.code ?? null;
}

/** The personal pass: one per person, so this card becomes the primary one. Null for someone else's card. */
export async function buildPersonalPass(cardId: string, ownerId: string, origin: string): Promise<BuiltPass | null> {
  const [card] = await readCards(ownerId, [cardId]);
  if (!card) return null;
  const name = cardName(card);
  const file = await buildPass({
    style: "generic",
    serialNumber: `person-${ownerId}`,
    organizationName: "ADED",
    description: name,
    primary: { key: "name", label: "Name", value: name },
    secondary: card.title?.trim() ? [{ key: "title", label: "Title", value: card.title.trim() }] : [],
    backFields: [{ key: "card", label: "Open my card", value: cardQr(origin, card) }],
    barcodeMessage: cardQr(origin, card),
  });
  if (card.is_primary !== true) {
    const admin = createAdminSupabaseClient();
    const updated = await admin.from("cards").update({ is_primary: true }).eq("id", card.id).eq("owner_id", ownerId);
    if (updated.error) console.error("[wallet] primary", updated.error.message);
  }
  return { file, name };
}
