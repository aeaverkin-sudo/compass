import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import {
  PDFDocument,
  PDFString,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
} from "pdf-lib";
import type { Card, ContactItem } from "@/shared/types";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { composeCard } from "@/shared/services/card-zones";
import { linkDisplay } from "@/shared/services/link-display";

/** Brand orange on the live card, matched one-to-one in the PDF. */
const ACCENT = rgb(0xf2 / 255, 0x62 / 255, 0x1c / 255);
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.6, 0.6, 0.6);
const RULE = rgb(0.07, 0.07, 0.07);

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PHOTO = 96;

export type PublicCardPdfInput = {
  card: Pick<Card, "displayName" | "title" | "photoAttachmentId" | "publicToken">;
  items: ContactItem[];
  /** Photo bytes already loaded from Storage. */
  photoBytes?: Uint8Array | null;
  photoMime?: string | null;
  /** Notes this viewer already received. Voice is ignored. */
  notes?: DeliveredNote[];
  /** Selfie bytes keyed by attachment id. */
  noteImages?: Record<string, { bytes: Uint8Array; mime: string }>;
  /** Public site origin, so `/f/…` links work inside a saved PDF. */
  origin: string;
};

/**
 * The standard PDF fonts are Latin-only and throw on Cyrillic.
 * Arimo shares Helvetica's metrics and covers Latin, Cyrillic and Greek.
 */
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let fontFiles: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;

function loadFontFiles() {
  fontFiles ??= Promise.all([
    readFile(path.join(FONT_DIR, "Arimo-Regular.ttf")),
    readFile(path.join(FONT_DIR, "Arimo-Bold.ttf")),
  ]).then(([regular, bold]) => ({ regular, bold }));
  fontFiles.catch(() => {
    fontFiles = null;
  });
  return fontFiles;
}

type Cursor = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
};

function ensureSpace(cursor: Cursor, need: number) {
  if (cursor.y - need >= MARGIN) return;
  cursor.page = cursor.doc.addPage([PAGE_W, PAGE_H]);
  cursor.y = PAGE_H - MARGIN;
}

function addUriLink(page: PDFPage, url: string, x: number, y: number, width: number, height: number) {
  const annot = page.doc.context.register(
    page.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of(url),
      },
    }),
  );
  page.node.addAnnot(annot);
}

async function embedImage(
  doc: PDFDocument,
  bytes: Uint8Array,
  mime?: string | null,
): Promise<PDFImage | null> {
  try {
    const kind = (mime ?? "").toLowerCase();
    if (kind.includes("png")) return await doc.embedPng(bytes);
    return await doc.embedJpg(bytes);
  } catch {
    try {
      return await doc.embedPng(bytes);
    } catch {
      try {
        return await doc.embedJpg(bytes);
      } catch {
        return null;
      }
    }
  }
}

/** object-cover into a square: fill the box, crop overflow, never stretch. */
function drawCoverSquare(
  page: PDFPage,
  image: PDFImage,
  left: number,
  bottom: number,
  size: number,
) {
  const scale = Math.max(size / image.width, size / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const x = left + (size - drawW) / 2;
  const y = bottom + (size - drawH) / 2;

  page.pushOperators(
    pushGraphicsState(),
    moveTo(left, bottom),
    lineTo(left + size, bottom),
    lineTo(left + size, bottom + size),
    lineTo(left, bottom + size),
    closePath(),
    clip(),
    endPath(),
  );
  page.drawImage(image, { x, y, width: drawW, height: drawH });
  page.pushOperators(popGraphicsState());
}

function drawHairline(cursor: Cursor) {
  ensureSpace(cursor, 16);
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: MARGIN + CONTENT_W, y: cursor.y },
    thickness: 0.5,
    color: RULE,
  });
  cursor.y -= 16;
}

function drawSectionLabel(cursor: Cursor, title: string) {
  ensureSpace(cursor, 28);
  cursor.page.drawText(title.toUpperCase(), {
    x: MARGIN,
    y: cursor.y,
    size: 9,
    font: cursor.font,
    color: MUTED,
  });
  cursor.y -= 16;
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length === 0 || (words.length === 1 && !words[0])) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const tryChunk = chunk + ch;
      if (font.widthOfTextAtSize(tryChunk, size) <= maxWidth) {
        chunk = tryChunk;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}

function absoluteUrl(raw: string, origin: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^mailto:/i.test(value) || /^tel:/i.test(value)) return value;
  if (value.startsWith("/")) return origin ? `${origin}${value}` : null;
  if (value.includes("@") && !value.includes(" ")) return `mailto:${value}`;
  if (/^\+?[\d\s().-]{6,}$/.test(value)) return `tel:${value.replace(/[^\d+]/g, "")}`;
  if (/^[\w.-]+\.[\w.-]+/.test(value)) return `https://${value}`;
  return null;
}

/** A stored file, whichever zone it landed in. The link is `/f/{id}`, not the zone name. */
function storedFileHref(
  row: { item: ContactItem | null; url: string },
  origin: string,
): string | null {
  const url = row.url.trim();
  if (url.startsWith("/f/")) return absoluteUrl(url, origin);
  const id = row.item?.attachmentId;
  if (id) return absoluteUrl(`/f/${id}`, origin);
  return null;
}

function drawFileOpen(cursor: Cursor, label: string, href: string) {
  const size = 11;
  const prefix = `${label} — `;
  const action = "Open →";
  ensureSpace(cursor, size + 6);
  const prefixWidth = cursor.font.widthOfTextAtSize(prefix, size);
  cursor.page.drawText(prefix, {
    x: MARGIN,
    y: cursor.y,
    size,
    font: cursor.font,
    color: INK,
  });
  const actionWidth = cursor.font.widthOfTextAtSize(action, size);
  const actionX = MARGIN + prefixWidth;
  cursor.page.drawText(action, {
    x: actionX,
    y: cursor.y,
    size,
    font: cursor.font,
    color: ACCENT,
  });
  cursor.page.drawLine({
    start: { x: actionX, y: cursor.y - 1 },
    end: { x: actionX + actionWidth, y: cursor.y - 1 },
    thickness: 0.4,
    color: ACCENT,
  });
  addUriLink(cursor.page, href, actionX, cursor.y - 2, actionWidth, size + 4);
  cursor.y -= size + 6;
}

function rowValue(row: { item: ContactItem | null; value: string; url: string }): string {
  if (row.item) {
    const shown = linkDisplay(row.item).trim();
    if (shown) return shown;
  }
  return row.value.trim();
}

function drawLinkedLine(
  cursor: Cursor,
  text: string,
  href: string | null,
  size: number,
  color = INK,
) {
  const lines = wrapLines(text, cursor.font, size, CONTENT_W);
  for (const line of lines) {
    ensureSpace(cursor, size + 6);
    const width = Math.min(cursor.font.widthOfTextAtSize(line, size), CONTENT_W);
    cursor.page.drawText(line, {
      x: MARGIN,
      y: cursor.y,
      size,
      font: cursor.font,
      color: href ? ACCENT : color,
      maxWidth: CONTENT_W,
    });
    if (href) {
      cursor.page.drawLine({
        start: { x: MARGIN, y: cursor.y - 1 },
        end: { x: MARGIN + width, y: cursor.y - 1 },
        thickness: 0.4,
        color: ACCENT,
      });
      addUriLink(cursor.page, href, MARGIN, cursor.y - 2, width, size + 4);
    }
    cursor.y -= size + 6;
  }
}

const QR_PT = 96;

/** Black, high correction, and the library's quiet zone. Orange at this size fails scanners. */
async function embedLiveQr(doc: PDFDocument, url: string): Promise<PDFImage> {
  const png = await QRCode.toBuffer(url, {
    errorCorrectionLevel: "H",
    margin: 4,
    width: 512,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return doc.embedPng(png);
}

function drawInvitation(cursor: Cursor, name: string, liveUrl: string, qr: PDFImage) {
  const textX = MARGIN + QR_PT + 16;
  const textW = CONTENT_W - QR_PT - 16;
  const blurbLines = wrapLines(
    `Follow ${name} and find people in your professional network.`,
    cursor.font,
    10,
    textW,
  );
  const followLines = wrapLines(`FOLLOW ${name.toUpperCase()} →`, cursor.font, 11, textW);
  const textHeight = 18 + blurbLines.length * 13 + 4 + followLines.length * 15 + 16;
  const block = Math.max(QR_PT, textHeight);
  ensureSpace(cursor, block + 12);
  cursor.y -= 8;

  const top = cursor.y;
  cursor.page.drawImage(qr, { x: MARGIN, y: top - QR_PT, width: QR_PT, height: QR_PT });
  addUriLink(cursor.page, liveUrl, MARGIN, top - QR_PT, QR_PT, QR_PT);

  let y = top - 2;
  cursor.page.drawText("Keep this connection.", {
    x: textX,
    y: y - 12,
    size: 12,
    font: cursor.fontBold,
    color: INK,
    maxWidth: textW,
  });
  y -= 20;
  for (const line of blurbLines) {
    cursor.page.drawText(line, {
      x: textX,
      y: y - 10,
      size: 10,
      font: cursor.font,
      color: INK,
      maxWidth: textW,
    });
    y -= 13;
  }
  y -= 4;
  for (const line of followLines) {
    const width = Math.min(cursor.font.widthOfTextAtSize(line, 11), textW);
    cursor.page.drawText(line, {
      x: textX,
      y: y - 11,
      size: 11,
      font: cursor.font,
      color: ACCENT,
      maxWidth: textW,
    });
    cursor.page.drawLine({
      start: { x: textX, y: y - 12 },
      end: { x: textX + width, y: y - 12 },
      thickness: 0.4,
      color: ACCENT,
    });
    addUriLink(cursor.page, liveUrl, textX, y - 13, width, 15);
    y -= 15;
  }
  y -= 4;
  cursor.page.drawText("Search · Connect · Remember", {
    x: textX,
    y: y - 9,
    size: 9,
    font: cursor.font,
    color: MUTED,
    maxWidth: textW,
  });

  cursor.y = top - block - 8;
}

export async function generatePublicCardPdf(input: PublicCardPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const files = await loadFontFiles();
  const font = await doc.embedFont(files.regular, { subset: true });
  const fontBold = await doc.embedFont(files.bold, { subset: true });
  const first = doc.addPage([PAGE_W, PAGE_H]);
  const cursor: Cursor = { doc, page: first, y: PAGE_H - MARGIN, font, fontBold };

  const name = input.card.displayName.replace(/\n/g, " ").trim() || "Portfolio";
  const title = input.card.title.trim();
  const photo =
    input.photoBytes && input.photoBytes.byteLength > 0
      ? await embedImage(doc, input.photoBytes, input.photoMime)
      : null;

  const mastheadTop = cursor.y;
  const mastheadBottom = mastheadTop - PHOTO;
  if (photo) {
    drawCoverSquare(first, photo, MARGIN, mastheadBottom, PHOTO);
  }

  const textLeft = photo ? MARGIN + PHOTO + 16 : MARGIN;
  const textWidth = photo ? CONTENT_W - PHOTO - 16 : CONTENT_W;
  let textY = mastheadTop - 4;

  const nameSize = 22;
  for (const line of wrapLines(name, fontBold, nameSize, textWidth)) {
    first.drawText(line, {
      x: textLeft,
      y: textY - nameSize,
      size: nameSize,
      font: fontBold,
      color: INK,
      maxWidth: textWidth,
    });
    textY -= nameSize + 4;
  }

  if (title) {
    textY -= 4;
    first.drawText(title.toUpperCase(), {
      x: textLeft,
      y: textY - 9,
      size: 9,
      font,
      color: MUTED,
      maxWidth: textWidth,
    });
    textY -= 14;
  }

  cursor.y = Math.min(mastheadBottom, textY) - 20;
  drawHairline(cursor);

  const { zones } = composeCard(input.items);
  for (const zone of zones) {
    ensureSpace(cursor, 40);
    drawSectionLabel(cursor, zone.title);
    for (const row of zone.rows) {
      const label = row.axis.trim();
      const value = rowValue(row).slice(0, 500);
      if (!value) continue;
      const fileHref = storedFileHref(row, input.origin);
      if (fileHref) {
        drawFileOpen(cursor, (label || value).slice(0, 80), fileHref);
        cursor.y -= 6;
        continue;
      }
      const href = absoluteUrl(row.url, input.origin) ?? absoluteUrl(value, input.origin);
      if (label) {
        ensureSpace(cursor, 14);
        cursor.page.drawText(label.toUpperCase(), {
          x: MARGIN,
          y: cursor.y,
          size: 8,
          font: cursor.font,
          color: MUTED,
        });
        cursor.y -= 12;
      }
      drawLinkedLine(cursor, value, href, 11);
      cursor.y -= 6;
    }
    cursor.y -= 8;
    drawHairline(cursor);
  }

  const notes = (input.notes ?? []).filter((note) => note.type === "text" || note.type === "selfie");
  if (notes.length > 0) {
    ensureSpace(cursor, 40);
    drawSectionLabel(cursor, "Notes");
    for (const note of notes) {
      if (note.type === "text") {
        drawSectionLabel(cursor, "Text");
        drawLinkedLine(cursor, note.content.slice(0, 800), null, 11);
        cursor.y -= 8;
        continue;
      }
      drawSectionLabel(cursor, "Selfie");
      const imageRef = note.attachmentId ? input.noteImages?.[note.attachmentId] : undefined;
      if (imageRef) {
        const image = await embedImage(doc, imageRef.bytes, imageRef.mime);
        if (image) {
          const size = 72;
          ensureSpace(cursor, size + 12);
          drawCoverSquare(cursor.page, image, MARGIN, cursor.y - size, size);
          cursor.y -= size + 12;
          continue;
        }
      }
      drawLinkedLine(cursor, "Selfie unavailable", null, 10, MUTED);
      cursor.y -= 8;
    }
  }

  const token = input.card.publicToken.trim();
  if (token && input.origin) {
    const liveUrl = `${input.origin}/c/${token}`;
    const qr = await embedLiveQr(doc, liveUrl);
    drawInvitation(cursor, name, liveUrl, qr);
    const registerUrl = `${input.origin}/register`;
    const label = "Create your profile";
    ensureSpace(cursor, 28);
    const labelWidth = Math.min(cursor.font.widthOfTextAtSize(label, 11), CONTENT_W);
    cursor.page.drawText(label, {
      x: MARGIN,
      y: cursor.y - 16,
      size: 11,
      font: cursor.font,
      color: INK,
    });
    addUriLink(cursor.page, registerUrl, MARGIN, cursor.y - 18, labelWidth, 16);
    cursor.y -= 28;
  }

  return doc.save();
}

/** Safe download name. Cyrillic and emoji become empty slots; empty → card.pdf. */
export function cardPdfFilename(displayName: string) {
  const ascii = displayName
    .replace(/\n/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]+/g, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${ascii || "card"}.pdf`;
}

/** One page for a frozen trial. The public card is not in this file. */
export async function generateInactiveCardPdf(): Promise<Uint8Array> {
  const { regular } = await loadFontFiles();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regular, { subset: true });
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawText("Визитка неактивна", {
    x: MARGIN,
    y: PAGE_H / 2,
    size: 18,
    font,
    color: INK,
  });
  return doc.save();
}
