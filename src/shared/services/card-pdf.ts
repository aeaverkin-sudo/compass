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
import { composeCard, type CardDisplayRow } from "@/shared/services/card-zones";
import { linkDisplay } from "@/shared/services/link-display";

/** Phone sheet, about 9:19.5. Not A4. */
const PAGE_W = 390;
const PAGE_H = 844;
const MARGIN_X = 28;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 28;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const QR = 132;
const PHOTO = 92;
const BAND_H = 72;

const ORANGE = rgb(0xe8 / 255, 0x64 / 255, 0x0c / 255);
const INK = rgb(0x11 / 255, 0x11 / 255, 0x11 / 255);
const LABEL = rgb(0x9c / 255, 0x98 / 255, 0x8e / 255);
const RULE = rgb(0xa6 / 255, 0xa2 / 255, 0x9a / 255);
const UNDER = rgb(0xc9 / 255, 0xc6 / 255, 0xbf / 255);
const SKY = rgb(0xc5 / 255, 0xe8 / 255, 0xf7 / 255);

const LABEL_W = 86;
const COL_GAP = 12;
const VALUE_SIZE = 13;
const VALUE_LEAD = 18;
const LABEL_SIZE = 9.5;
const LABEL_TRACK = 0.12;
const ROLE_SIZE = 10;
const ROLE_TRACK = 0.16;
const ROLE_LEAD = 14;

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
 * Medium is Arimo at weight 500. The family has no weight 300, so light text uses Regular.
 */
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let fontFiles: Promise<{ regular: Uint8Array; medium: Uint8Array }> | null = null;

function loadFontFiles() {
  fontFiles ??= Promise.all([
    readFile(path.join(FONT_DIR, "Arimo-Regular.ttf")),
    readFile(path.join(FONT_DIR, "Arimo-Medium.ttf")),
  ]).then(([regular, medium]) => ({ regular, medium }));
  fontFiles.catch(() => {
    fontFiles = null;
  });
  return fontFiles;
}

function addUriLink(page: PDFPage, url: string, x: number, y: number, width: number, height: number) {
  if (width <= 0 || height <= 0) return;
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
function drawCoverSquare(page: PDFPage, image: PDFImage, left: number, bottom: number, size: number) {
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

function trackedWidth(text: string, font: PDFFont, size: number, tracking: number) {
  if (!text) return 0;
  let width = 0;
  for (const ch of text) width += font.widthOfTextAtSize(ch, size);
  return width + size * tracking * (text.length - 1);
}

function drawTracked(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  tracking: number,
) {
  const gap = size * tracking;
  let cursor = x;
  for (const ch of text) {
    page.drawText(ch, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(ch, size) + gap;
  }
}

function wrapTracked(text: string, font: PDFFont, size: number, maxWidth: number, tracking: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length === 0 || !words[0]) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (trackedWidth(next, font, size, tracking) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (trackedWidth(word, font, size, tracking) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const tryChunk = chunk + ch;
      if (trackedWidth(tryChunk, font, size, tracking) <= maxWidth) chunk = tryChunk;
      else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}

function clipLine(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
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

function storedFileHref(row: { item: ContactItem | null; url: string }, origin: string): string | null {
  const url = row.url.trim();
  if (url.startsWith("/f/")) return absoluteUrl(url, origin);
  const id = row.item?.attachmentId;
  if (id) return absoluteUrl(`/f/${id}`, origin);
  return null;
}

function rowValue(row: { item: ContactItem | null; value: string }): string {
  if (row.item) {
    const shown = linkDisplay(row.item).trim();
    if (shown) return shown;
  }
  return row.value.trim();
}

/** Orange modules, a real quiet zone, high correction. The box is 132pt, so the modules stay large enough to scan. */
async function embedLiveQr(doc: PDFDocument, url: string): Promise<PDFImage> {
  const png = await QRCode.toBuffer(url, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 512,
    color: { dark: "#E8640C", light: "#FFFFFF" },
  });
  return doc.embedPng(png);
}

type Segment = { text: string; underline: boolean };

function layoutValue(prefix: string, value: string, font: PDFFont, maxWidth: number): Segment[][] {
  const tokens: Segment[] = [];
  const pushTokens = (text: string, underline: boolean) => {
    for (const token of text.split(/(\s+)/)) {
      if (token) tokens.push({ text: token, underline });
    }
  };
  if (prefix) pushTokens(prefix, false);
  if (value) pushTokens(value, true);
  if (tokens.length === 0) return [];

  const lines: Segment[][] = [];
  let line: Segment[] = [];
  let used = 0;
  const commit = () => {
    if (line.length) lines.push(line);
    line = [];
    used = 0;
  };
  for (const token of tokens) {
    const width = font.widthOfTextAtSize(token.text, VALUE_SIZE);
    if (used > 0 && used + width > maxWidth) commit();
    if (width <= maxWidth) {
      line.push(token);
      used += width;
      continue;
    }
    let chunk = "";
    for (const ch of token.text) {
      const next = chunk + ch;
      if (used + font.widthOfTextAtSize(next, VALUE_SIZE) > maxWidth && (chunk || used > 0)) {
        if (chunk) {
          line.push({ text: chunk, underline: token.underline });
          used += font.widthOfTextAtSize(chunk, VALUE_SIZE);
        }
        commit();
        chunk = ch;
      } else chunk = next;
    }
    if (chunk) {
      line.push({ text: chunk, underline: token.underline });
      used += font.widthOfTextAtSize(chunk, VALUE_SIZE);
    }
  }
  commit();
  return lines;
}

type Piece = {
  height: number;
  draw: (page: PDFPage, top: number) => void;
};

function withRule(piece: Piece): Piece {
  const gap = 14;
  return {
    height: piece.height + gap,
    draw: (page, top) => {
      page.drawLine({
        start: { x: MARGIN_X, y: top },
        end: { x: MARGIN_X + CONTENT_W, y: top },
        thickness: 0.5,
        color: RULE,
      });
      piece.draw(page, top - gap);
    },
  };
}

function rowPiece(
  label: string,
  lines: Segment[][],
  href: string | null,
  font: PDFFont,
): Piece {
  const height = Math.max(lines.length, 1) * VALUE_LEAD;
  const valueX = MARGIN_X + LABEL_W + COL_GAP;
  return {
    height,
    draw: (page, top) => {
      const firstBaseline = top - VALUE_SIZE;
      if (label) {
        drawTracked(page, label.toUpperCase(), MARGIN_X, firstBaseline, LABEL_SIZE, font, LABEL, LABEL_TRACK);
      }
      lines.forEach((segments, index) => {
        const baseline = firstBaseline - index * VALUE_LEAD;
        let x = valueX;
        let underStart: number | null = null;
        let underEnd = x;
        for (const segment of segments) {
          const width = font.widthOfTextAtSize(segment.text, VALUE_SIZE);
          page.drawText(segment.text, { x, y: baseline, size: VALUE_SIZE, font, color: INK });
          if (segment.underline) {
            if (underStart === null) underStart = x;
            underEnd = x + width;
          }
          x += width;
        }
        if (href && underStart !== null && underEnd > underStart) {
          const lineY = baseline - 3;
          page.drawLine({
            start: { x: underStart, y: lineY },
            end: { x: underEnd, y: lineY },
            thickness: 1,
            color: UNDER,
          });
          addUriLink(page, href, underStart, lineY - 1, underEnd - underStart, VALUE_SIZE + 4);
        }
      });
    },
  };
}

function textPiece(text: string, font: PDFFont, width: number): Piece[] {
  const lines = wrapTracked(text, font, VALUE_SIZE, width, 0);
  if (lines.length === 0) return [];
  return lines.map((line) => ({
    height: VALUE_LEAD,
    draw: (page, top) => {
      page.drawText(line, {
        x: MARGIN_X + LABEL_W + COL_GAP,
        y: top - VALUE_SIZE,
        size: VALUE_SIZE,
        font,
        color: INK,
        maxWidth: width,
      });
    },
  }));
}

type LaidPage = { pieces: Piece[]; top: number; endY: number };

function layoutPages(pieces: Piece[], firstTop: number, nextTop: number, floor: number): LaidPage[] {
  const pages: LaidPage[] = [];
  let index = 0;
  let top = firstTop;
  while (index < pieces.length) {
    const batch: Piece[] = [];
    let y = top;
    while (index < pieces.length) {
      const piece = pieces[index];
      if (batch.length > 0 && y - piece.height < floor) break;
      batch.push(piece);
      y -= piece.height;
      index += 1;
    }
    pages.push({ pieces: batch, top, endY: y });
    top = nextTop;
  }
  return pages;
}

/** Middle sheets use the full page. The slogan band is reserved only on the last sheet. */
function paginate(pieces: Piece[], firstTop: number, nextTop: number): LaidPage[] {
  const bandFloor = BAND_H + 12;
  if (pieces.length === 0) return [{ pieces: [], top: firstTop, endY: firstTop }];

  const pages = layoutPages(pieces, firstTop, nextTop, MARGIN_BOTTOM);
  const last = pages[pages.length - 1];
  if (last.endY >= bandFloor) return pages;

  const rest: Piece[] = [];
  while (last.pieces.length > 0 && last.endY < bandFloor) {
    const piece = last.pieces.pop();
    if (!piece) break;
    last.endY += piece.height;
    rest.unshift(piece);
  }
  const kept = pages.filter((page, index) => index === 0 || page.pieces.length > 0);
  if (rest.length === 0) return kept;
  return [...kept, ...layoutPages(rest, nextTop, nextTop, bandFloor)];
}

function nameLayout(raw: string, font: PDFFont, width: number) {
  const split = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
  const lines = split.length > 0 ? split : ["Portfolio"];
  let size = 23;
  const widest = Math.max(...lines.map((line) => font.widthOfTextAtSize(line, size)));
  if (widest > width) size = Math.max(16, (size * width) / widest);
  return { lines, size };
}

function drawMasthead(
  page: PDFPage,
  input: {
    nameLines: string[];
    nameSize: number;
    roleLines: string[];
    photo: PDFImage | null;
    qr: PDFImage | null;
    liveUrl: string;
    photoBottom: number;
    ruleY: number;
    qrBottom: number;
    font: PDFFont;
    medium: PDFFont;
    textX: number;
    textW: number;
  },
) {
  if (input.qr) {
    const qrX = (PAGE_W - QR) / 2;
    page.drawImage(input.qr, { x: qrX, y: input.qrBottom, width: QR, height: QR });
    if (input.liveUrl) addUriLink(page, input.liveUrl, qrX, input.qrBottom, QR, QR);
  }
  page.drawLine({
    start: { x: MARGIN_X, y: input.ruleY },
    end: { x: MARGIN_X + CONTENT_W, y: input.ruleY },
    thickness: 0.5,
    color: RULE,
  });
  if (input.photo) drawCoverSquare(page, input.photo, MARGIN_X, input.photoBottom, PHOTO);

  const lead = input.nameSize + 3;
  input.nameLines.forEach((line, index) => {
    const fromLast = input.nameLines.length - 1 - index;
    page.drawText(line, {
      x: input.textX,
      y: input.photoBottom + fromLast * lead,
      size: input.nameSize,
      font: input.medium,
      color: INK,
      maxWidth: input.textW,
    });
  });

  input.roleLines.forEach((line, index) => {
    drawTracked(
      page,
      line,
      input.textX,
      input.photoBottom - 12 - ROLE_SIZE - index * ROLE_LEAD,
      ROLE_SIZE,
      input.font,
      LABEL,
      ROLE_TRACK,
    );
  });
}

function drawRunningHeader(page: PDFPage, name: string, font: PDFFont) {
  const baseline = PAGE_H - MARGIN_TOP - 11;
  page.drawText(clipLine(name, font, 11, CONTENT_W), {
    x: MARGIN_X,
    y: baseline,
    size: 11,
    font,
    color: INK,
  });
  const ruleY = baseline - 10;
  page.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: MARGIN_X + CONTENT_W, y: ruleY },
    thickness: 0.5,
    color: RULE,
  });
}

function drawBand(page: PDFPage, homeUrl: string, regular: PDFFont, medium: PDFFont) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: BAND_H, color: SKY });
  const line2Y = 22;
  const line1Y = line2Y + 10.5 + 8;
  page.drawText("Every version of you.", {
    x: MARGIN_X,
    y: line1Y,
    size: 13,
    font: medium,
    color: INK,
  });
  page.drawText("One library. A portfolio for every room.", {
    x: MARGIN_X,
    y: line2Y,
    size: 10.5,
    font: regular,
    color: INK,
  });
  const domain = "adedme.com";
  const domainSize = 12;
  const domainW = regular.widthOfTextAtSize(domain, domainSize);
  const domainX = PAGE_W - MARGIN_X - domainW;
  page.drawText(domain, { x: domainX, y: line1Y, size: domainSize, font: regular, color: INK });
  page.drawLine({
    start: { x: domainX, y: line1Y - 3 },
    end: { x: domainX + domainW, y: line1Y - 3 },
    thickness: 1,
    color: INK,
    opacity: 0.28,
  });
  addUriLink(page, homeUrl, domainX, line1Y - 4, domainW, domainSize + 6);
}

function valueWidth() {
  return CONTENT_W - LABEL_W - COL_GAP;
}

function piecesForRow(row: CardDisplayRow, origin: string, font: PDFFont, showLabel: string) {
  const value = rowValue(row).slice(0, 500);
  if (!value) return [];
  const fileHref = storedFileHref(row, origin);
  const href = fileHref ?? absoluteUrl(row.url, origin) ?? absoluteUrl(value, origin);
  const prefix = row.axis.trim() ? `${row.axis.trim()} / ` : "";
  const lines = layoutValue(prefix, value, font, valueWidth());
  const marked = lines.map((segments) =>
    segments.map((segment) => ({ ...segment, underline: Boolean(href) && segment.underline })),
  );
  return [rowPiece(showLabel, marked.length ? marked : [[{ text: value, underline: Boolean(href) }]], href, font)];
}

export async function generatePublicCardPdf(input: PublicCardPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const files = await loadFontFiles();
  const regular = await doc.embedFont(files.regular, { subset: true });
  const medium = await doc.embedFont(files.medium, { subset: true });

  const name = input.card.displayName.trim() || "Portfolio";
  const runningName = name.replace(/\n/g, " ").trim() || "Portfolio";
  const title = input.card.title.trim();
  const photo =
    input.photoBytes && input.photoBytes.byteLength > 0
      ? await embedImage(doc, input.photoBytes, input.photoMime)
      : null;

  const token = input.card.publicToken.trim();
  const liveUrl = token && input.origin ? `${input.origin.replace(/\/$/, "")}/c/${token}` : "";
  const homeUrl = input.origin ? `${input.origin.replace(/\/$/, "")}/` : "https://www.adedme.com";
  const qr = liveUrl ? await embedLiveQr(doc, liveUrl) : null;

  const hasPhoto = Boolean(photo);
  const textX = hasPhoto ? MARGIN_X + PHOTO + 14 : MARGIN_X;
  const textW = hasPhoto ? CONTENT_W - PHOTO - 14 : CONTENT_W;
  const fitted = nameLayout(name, medium, textW);
  const roleLines = title ? wrapTracked(title.toUpperCase(), regular, ROLE_SIZE, textW, ROLE_TRACK) : [];

  let y = PAGE_H - MARGIN_TOP;
  let qrBottom = y;
  if (qr) {
    qrBottom = y - QR;
    y = qrBottom - 16;
  }
  const ruleY = y;
  const photoTop = ruleY - 18;
  const photoBottom = photoTop - PHOTO;
  const contentTop =
    (roleLines.length ? photoBottom - 12 - ROLE_SIZE - (roleLines.length - 1) * ROLE_LEAD : photoBottom) - 22;

  const headerBlock = 11 + 10 + 16;
  const nextTop = PAGE_H - MARGIN_TOP - headerBlock;

  const pieces: Piece[] = [];
  const { zones } = composeCard(input.items);
  for (const zone of zones) {
    const rows = zone.rows.flatMap((row, index) => piecesForRow(row, input.origin, regular, index === 0 ? zone.title : ""));
    if (rows.length === 0) continue;
    pieces.push(withRule(rows[0]), ...rows.slice(1));
  }

  const notes = (input.notes ?? []).filter((note) => note.type === "text" || note.type === "selfie");
  if (notes.length > 0) {
    let labeled = false;
    let noteRule = true;
    for (const note of notes) {
      if (note.type === "text") {
        const body = note.content.replace(/\s+/g, " ").trim().slice(0, 800);
        if (!body) continue;
        const lines = layoutValue("", body, regular, valueWidth());
        const piece = rowPiece(labeled ? "" : "Notes", lines, null, regular);
        pieces.push(noteRule ? withRule(piece) : piece);
        noteRule = false;
        labeled = true;
        continue;
      }
      const imageRef = note.attachmentId ? input.noteImages?.[note.attachmentId] : undefined;
      const image = imageRef ? await embedImage(doc, imageRef.bytes, imageRef.mime) : null;
      const label = labeled ? "" : "Notes";
      labeled = true;
      const size = 64;
      const piece: Piece = !image
        ? rowPiece(label, layoutValue("", "Selfie unavailable", regular, valueWidth()), null, regular)
        : {
            height: size + 8,
            draw: (page, top) => {
              if (label) {
                drawTracked(page, label.toUpperCase(), MARGIN_X, top - VALUE_SIZE, LABEL_SIZE, regular, LABEL, LABEL_TRACK);
              }
              drawCoverSquare(page, image, MARGIN_X + LABEL_W + COL_GAP, top - size, size);
            },
          };
      pieces.push(noteRule ? withRule(piece) : piece);
      noteRule = false;
    }
  }

  const pages = paginate(pieces, contentTop, nextTop);
  pages.forEach((laid, index) => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    if (index === 0) {
      drawMasthead(page, {
        nameLines: fitted.lines,
        nameSize: fitted.size,
        roleLines,
        photo,
        qr,
        liveUrl,
        photoBottom,
        ruleY,
        qrBottom,
        font: regular,
        medium,
        textX,
        textW,
      });
    } else {
      drawRunningHeader(page, runningName, medium);
    }
    let cursor = laid.top;
    for (const piece of laid.pieces) {
      piece.draw(page, cursor);
      cursor -= piece.height;
    }
    if (index === pages.length - 1) drawBand(page, homeUrl, regular, medium);
  });

  return doc.save();
}

/** Safe download name. Cyrillic and emoji become empty slots; empty → portfolio.pdf. */
export function cardPdfFilename(displayName: string) {
  const ascii = displayName
    .replace(/\n/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]+/g, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${ascii || "portfolio"}.pdf`;
}

/** One phone sheet for a frozen trial. The public card is not in this file. */
export async function generateInactiveCardPdf(): Promise<Uint8Array> {
  const { regular } = await loadFontFiles();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regular, { subset: true });
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const label = "Portfolio inactive";
  const size = 18;
  const width = font.widthOfTextAtSize(label, size);
  page.drawText(label, {
    x: (PAGE_W - width) / 2,
    y: PAGE_H / 2,
    size,
    font,
    color: INK,
  });
  return doc.save();
}
