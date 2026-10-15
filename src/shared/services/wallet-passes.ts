import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { downloadAttachmentBytes, loadAttachment } from "@/shared/services/attachment-api";
import { buildPass } from "@/shared/services/wallet-pass";
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
};

/** A database without `handle` or `is_primary` still gives the card. */
async function readCards(ownerId: string, ids: string[]): Promise<(CardRow & { is_primary?: boolean | null })[]> {
  const admin = createAdminSupabaseClient();
  const extras = ["handle", "is_primary", "photo_attachment_id"];
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

/** A back-of-pass line: a tappable phrase, no address on show. */
function backLink(key: string, text: string, url: string): WalletBackField {
  const href = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return { key, value: url, attributedValue: `<a href="${href}">${text}</a>` };
}

const UNDER_QR = "Open my portfolio · Scan a card — tap ···";

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
async function walletSerial(ownerId: string, cardId: string): Promise<string> {
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
  return slot === 1 ? `person-${ownerId}` : `person-${ownerId}-${slot}`;
}

/** The pass of one of my cards; this card becomes the primary one. Null for someone else's card. */
export async function buildPersonalPass(cardId: string, ownerId: string, origin: string): Promise<BuiltPass | null> {
  const [card] = await readCards(ownerId, [cardId]);
  if (!card) return null;
  const name = cardName(card);
  const position = cardCaption(card);
  const [photoPng, serialNumber] = await Promise.all([cardPhoto(card), walletSerial(ownerId, card.id)]);
  const strip = await walletStrip({ name: card.display_name?.trim() || "Guest", position, photoPng });
  const file = await buildPass({
    serialNumber,
    organizationName: "ADED",
    description: name,
    strip,
    backFields: [
      backLink("portfolio", "Open my portfolio", cardQr(origin, card)),
      backLink("scan", "Scan a card", `${origin}/scan`),
    ],
    barcodeMessage: cardQr(origin, card),
    barcodeAltText: UNDER_QR,
  });
  if (card.is_primary !== true) {
    const admin = createAdminSupabaseClient();
    const updated = await admin.from("cards").update({ is_primary: true }).eq("id", card.id).eq("owner_id", ownerId);
    if (updated.error) console.error("[wallet] primary", updated.error.message);
  }
  return { file, name };
}
