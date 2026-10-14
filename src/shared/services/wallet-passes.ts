import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { downloadAttachmentBytes, loadAttachment } from "@/shared/services/attachment-api";
import { buildPass, type PassImage } from "@/shared/services/wallet-pass";
import { walletCardQr, type WalletBackField } from "@/shared/services/wallet-pass-content";

export type BuiltPass = { file: Buffer; name: string };

type CardRow = {
  id: string;
  display_name: string | null;
  public_token: string;
  handle?: string | null;
  photo_attachment_id?: string | null;
};

/** A database without `handle` or `is_primary` still gives the card. */
async function readCards(ownerId: string, ids: string[]): Promise<(CardRow & { is_primary?: boolean | null })[]> {
  const admin = createAdminSupabaseClient();
  const extras = ["handle", "is_primary", "photo_attachment_id"];
  for (;;) {
    const query = admin.from("cards").select(["id", "display_name", "public_token", ...extras].join(", ")).eq("owner_id", ownerId).in("id", ids);
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

const THUMB_BOX = 90;
const THUMB_PHOTO = 80;

/**
 * The card photo as an 80-point square inside Apple's 90×90 thumbnail box, with its shadow baked in:
 * Wallet draws none on a generic pass. No photo, no thumbnail.
 */
async function cardThumbnail(card: CardRow): Promise<PassImage | null> {
  const bytes = await imageBytes(card.photo_attachment_id);
  if (!bytes) return null;
  try {
    const { default: sharp } = await import("sharp");
    const fill = async (scale: number) => {
      const box = THUMB_BOX * scale;
      const side = THUMB_PHOTO * scale;
      const left = Math.round((box - side) / 2);
      const top = 2 * scale;
      const shadow = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${2.5 * scale}"/></filter></defs><rect x="${left}" y="${top + 2 * scale}" width="${side}" height="${side}" fill="#000" fill-opacity="0.3" filter="url(#s)"/></svg>`;
      const photo = await sharp(Buffer.from(bytes), { failOn: "none" }).rotate().resize(side, side, { fit: "cover" }).png().toBuffer();
      return sharp(Buffer.from(shadow)).composite([{ input: photo, left, top }]).png().toBuffer();
    };
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

const UNDER_QR = "Open my portfolio · Scan a card — tap ··· above";

/** The personal pass: one per person, so this card becomes the primary one. Null for someone else's card. */
export async function buildPersonalPass(cardId: string, ownerId: string, origin: string): Promise<BuiltPass | null> {
  const [card] = await readCards(ownerId, [cardId]);
  if (!card) return null;
  const name = cardName(card);
  const file = await buildPass({
    serialNumber: `person-${ownerId}`,
    organizationName: "ADED",
    description: name,
    thumbnail: await cardThumbnail(card),
    primary: { key: "name", label: "NAME", value: name },
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
