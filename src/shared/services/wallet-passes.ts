import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { formatEventRange } from "@/shared/event/when";
import { downloadAttachmentBytes, loadAttachment } from "@/shared/services/attachment-api";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadOwnRegistration } from "@/shared/services/event-registration";
import { eventGuestEnd } from "@/shared/services/trial";
import { buildPass, type PassImage } from "@/shared/services/wallet-pass";
import { eventPassExpiry, walletCardQr, type WalletBackField } from "@/shared/services/wallet-pass-content";
import { eventStrip } from "@/shared/services/wallet-strip";

export type BuiltPass = { file: Buffer; name: string };

type CardRow = {
  id: string;
  display_name: string | null;
  title: string | null;
  public_token: string;
  handle?: string | null;
  photo_attachment_id?: string | null;
};

const PLACE_SECRET = "Revealed closer to the date";

/** A database without `handle` or `is_primary` still gives the card. */
async function readCards(ownerId: string, ids?: string[]): Promise<(CardRow & { is_primary?: boolean | null })[]> {
  const admin = createAdminSupabaseClient();
  const extras = ["handle", "is_primary", "photo_attachment_id"];
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

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

async function imageBytes(attachmentId: string | null | undefined): Promise<Uint8Array | null> {
  if (!attachmentId) return null;
  const row = await loadAttachment(attachmentId);
  if (!row || row.status !== "ready" || !IMAGE_MIMES.has(row.mime)) return null;
  return (await downloadAttachmentBytes(row)) ?? null;
}

/** The card photo as Apple's 90×90 point thumbnail, filled edge to edge. No photo, no thumbnail. */
async function cardThumbnail(card: CardRow): Promise<PassImage | null> {
  const bytes = await imageBytes(card.photo_attachment_id);
  if (!bytes) return null;
  try {
    const { default: sharp } = await import("sharp");
    const fill = (scale: number) =>
      sharp(Buffer.from(bytes), { failOn: "none" }).rotate().resize(90 * scale, 90 * scale, { fit: "cover" }).png().toBuffer();
    const [x1, x2, x3] = await Promise.all([fill(1), fill(2), fill(3)]);
    return { x1, x2, x3 };
  } catch {
    return null;
  }
}

/** A back-of-pass line: a tappable phrase, no address on show. */
function backLink(key: string, text: string, url: string): WalletBackField {
  const href = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return { key, value: url, attributedValue: `<a href="${href}">${text}</a>` };
}

const LINKS: { key: string; label: string; value: string } = { key: "links", label: "LINKS", value: "tap ··· above" };

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
  const eventUrl = `${origin}/e/${eventKey(event)}`;
  const backFields: WalletBackField[] = token
    ? [
        backLink("portfolio", "Open my portfolio", `${eventUrl}?g=${token}&go=1`),
        backLink("scan", "Scan a card", `${origin}/scan?g=${token}`),
        backLink("event", event.name, eventUrl),
      ]
    : [
        backLink("portfolio", "Open my portfolio", cardQr(origin, registered ?? qrCard)),
        backLink("scan", "Scan a card", `${origin}/scan`),
        backLink("event", event.name, eventUrl),
      ];

  const place = event.placeSecret ? PLACE_SECRET : event.place?.trim() || null;
  const when = formatEventRange(event.date, event.endsAt, event.timeZone);
  const strip = await eventStrip(event.name, event.theme, await imageBytes(event.logoAttachmentId));
  const file = await buildPass({
    style: "eventTicket",
    serialNumber: `event-${registration.id}`,
    organizationName: event.name,
    description: event.name,
    strip,
    header: { key: "door", label: "DOOR", value: "Show this" },
    primary: { key: "guest", label: "GUEST", value: cardName(registered ?? qrCard) },
    secondary: [
      ...(when ? [{ key: "when", label: "DATE", value: when }] : []),
      ...(place ? [{ key: "place", label: "PLACE", value: place }] : []),
    ],
    auxiliary: [LINKS],
    backFields,
    barcodeMessage: cardQr(origin, qrCard),
    relevantDate: event.date,
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
    thumbnail: await cardThumbnail(card),
    primary: { key: "name", label: "NAME", value: name },
    secondary: card.title?.trim() ? [{ key: "title", label: "TITLE", value: card.title.trim() }] : [],
    auxiliary: [LINKS],
    backFields: [
      backLink("portfolio", "Open my portfolio", cardQr(origin, card)),
      backLink("scan", "Scan a card", `${origin}/scan`),
    ],
    barcodeMessage: cardQr(origin, card),
  });
  if (card.is_primary !== true) {
    const admin = createAdminSupabaseClient();
    const updated = await admin.from("cards").update({ is_primary: true }).eq("id", card.id).eq("owner_id", ownerId);
    if (updated.error) console.error("[wallet] primary", updated.error.message);
  }
  return { file, name };
}
