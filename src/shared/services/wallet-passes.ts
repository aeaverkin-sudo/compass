import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { downloadAttachmentBytes, loadAttachment } from "@/shared/services/attachment-api";
import {
  composeCard,
  normalizeItemZones,
  normalizeRubricLabels,
  normalizeRubricOrder,
  orderCardZones,
  type CardZoneSection,
} from "@/shared/services/card-zones";
import { loadVisibleCardItems } from "@/shared/services/public-card";
import { buildPass, type PassField } from "@/shared/services/wallet-pass";
import { walletStrip } from "@/shared/services/wallet-strip";
import { walletCardQr, type WalletBackField } from "@/shared/services/wallet-pass-content";

export type BuiltPass = { file: Buffer; name: string };

type CardRow = {
  id: string;
  display_name: string | null;
  title?: string | null;
  public_token: string;
  handle?: string | null;
  photo_attachment_id?: string | null;
  rubric_order?: unknown;
  rubric_labels?: unknown;
  item_zones?: unknown;
};

/** A database without `handle` or `is_primary` still gives the card. */
async function readCards(ownerId: string, ids: string[]): Promise<(CardRow & { is_primary?: boolean | null })[]> {
  const admin = createAdminSupabaseClient();
  const extras = ["handle", "is_primary", "photo_attachment_id", "rubric_order", "rubric_labels", "item_zones"];
  for (;;) {
    const query = admin.from("cards").select(["id", "display_name", "title", "public_token", ...extras].join(", ")).eq("owner_id", ownerId).in("id", ids);
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

/** The card photo as a square PNG for the strip, 72 points at 3×. No photo, null. */
async function cardPhoto(card: CardRow): Promise<Buffer | null> {
  const bytes = await imageBytes(card.photo_attachment_id);
  if (!bytes) return null;
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(Buffer.from(bytes), { failOn: "none" }).rotate().resize(216, 216, { fit: "cover" }).png().toBuffer();
  } catch {
    return null;
  }
}

/** The line under the name, as the card header shows it. None there, none on the pass. */
function cardCaption(card: CardRow): string | null {
  return card.title?.replace(/\s+/g, " ").trim() || null;
}

/** A back-of-pass line: a tappable phrase. */
function backLink(key: string, label: string, text: string, url: string): WalletBackField {
  const href = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return { key, label, value: url, attributedValue: `<a href="${href}">${text}</a>` };
}

/** The card's sections in the order the card shows them. */
async function cardSections(card: CardRow): Promise<CardZoneSection[]> {
  const items = await loadVisibleCardItems(card.id);
  const scope = { rubricLabels: normalizeRubricLabels(card.rubric_labels), itemZones: normalizeItemZones(card.item_zones) };
  return orderCardZones(composeCard(items, undefined, scope).zones, normalizeRubricOrder(card.rubric_order));
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 01 · 02 · 03 under the strip: the first row of each of the card's first three sections. */
function portfolioFields(sections: CardZoneSection[]): PassField[] {
  return sections.slice(0, PORTFOLIO_FIELDS).flatMap((section, index) => {
    const value = oneLine(section.rows[0]?.value ?? "");
    if (!value) return [];
    const number = String(index + 1).padStart(2, "0");
    return [{ key: `row${number}`, label: `${number} · ${section.title}`.toUpperCase(), value }];
  });
}

function cardCity(sections: CardZoneSection[]): string | null {
  const value = sections.find((section) => section.id === "location")?.rows[0]?.value;
  return value ? oneLine(value) : null;
}

/** The section headed About, else the first long text the card shows. */
function cardAbout(sections: CardZoneSection[]): string | null {
  const titled = sections.find((section) => section.title.trim().toLowerCase() === "about");
  const text = titled?.rows[0]?.value ?? sections.find((section) => section.id === "additional")?.rows[0]?.value;
  if (!text?.trim()) return null;
  const flat = oneLine(text);
  return flat.length > ABOUT_MAX ? `${flat.slice(0, ABOUT_MAX - 1).trimEnd()}…` : flat;
}

/** The card's address as people type it, without the scheme. */
function shownAddress(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

const PORTFOLIO_FIELDS = 3;
const ABOUT_MAX = 280;
const LOGO_TEXT_MAX = 28;
const SUPPORT_EMAIL = "support@adedme.com";
const UNDER_QR = "TAP ⋯ TO OPEN SCANNER & PORTFOLIO";

const WALLET_SLOTS = 2;

type WalletSlot = { cardId: string; slot: number };

function readSlots(value: unknown): WalletSlot[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is WalletSlot =>
      Boolean(entry) && typeof entry.cardId === "string" && Number.isInteger(entry.slot) && entry.slot >= 1 && entry.slot <= WALLET_SLOTS,
  );
}

/**
 * Two passes per person at most. A card keeps its place; a new card takes a free one,
 * else the place of the card put in Wallet longest ago, and that pass is replaced on the phone.
 * The places live in the account's app metadata, newest last.
 */
async function walletSerial(ownerId: string, cardId: string): Promise<{ serial: string; slot: number }> {
  const admin = createAdminSupabaseClient();
  const user = (await admin.auth.admin.getUserById(ownerId)).data.user;
  const slots = readSlots(user?.app_metadata?.wallet_cards);
  const own = slots.find((entry) => entry.cardId === cardId);
  const taken = new Set(slots.map((entry) => entry.slot));
  const free = Array.from({ length: WALLET_SLOTS }, (_, index) => index + 1).find((slot) => !taken.has(slot));
  const slot = own?.slot ?? free ?? slots[0]?.slot ?? 1;
  const next = [...slots.filter((entry) => entry.slot !== slot), { cardId, slot }];
  if (user) {
    const saved = await admin.auth.admin.updateUserById(ownerId, { app_metadata: { ...user.app_metadata, wallet_cards: next } });
    if (saved.error) console.error("[wallet] slots", saved.error.message);
  }
  return { serial: slot === 1 ? `person-${ownerId}` : `person-${ownerId}-${slot}`, slot };
}

/** The pass of one of my cards; this card becomes the primary one. Null for someone else's card. */
export async function buildPersonalPass(cardId: string, ownerId: string, origin: string): Promise<BuiltPass | null> {
  const [card] = await readCards(ownerId, [cardId]);
  if (!card) return null;
  const name = cardName(card);
  const [photoPng, { serial, slot }, sections] = await Promise.all([
    cardPhoto(card),
    walletSerial(ownerId, card.id),
    cardSections(card),
  ]);
  const caption = [cardCaption(card), cardCity(sections)].filter(Boolean).join(" · ") || null;
  const strip = await walletStrip({ name: card.display_name?.trim() || "Guest", position: caption, photoPng });
  const portfolio = cardQr(origin, card);
  const address = shownAddress(portfolio);
  const about = cardAbout(sections);
  const file = await buildPass({
    serialNumber: serial,
    organizationName: "ADED",
    description: name,
    strip,
    logoText: address.length <= LOGO_TEXT_MAX ? address : shownAddress(origin),
    headerFields: [{ key: "number", label: "No.", value: String(slot).padStart(4, "0") }],
    secondaryFields: portfolioFields(sections),
    backFields: [
      backLink("portfolio", "Portfolio", address, portfolio),
      backLink("scan", "Scanner", "Open in app", `${origin}/scan`),
      backLink("contact", "Contact", SUPPORT_EMAIL, `mailto:${SUPPORT_EMAIL}`),
      ...(about ? [{ key: "about", label: "About", value: about }] : []),
      backLink("terms", "Terms", `${shownAddress(origin)}/terms`, `${origin}/terms`),
    ],
    barcodeMessage: portfolio,
    barcodeAltText: UNDER_QR,
  });
  if (card.is_primary !== true) {
    const admin = createAdminSupabaseClient();
    const updated = await admin.from("cards").update({ is_primary: true }).eq("id", card.id).eq("owner_id", ownerId);
    if (updated.error) console.error("[wallet] primary", updated.error.message);
  }
  return { file, name };
}
