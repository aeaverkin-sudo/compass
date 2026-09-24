import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CardSnapshot, ContactItem, NextScanAddon } from "@/shared/types";
import { typeLabel } from "./portfolio-catalog";
import { isAttachmentType } from "./portfolio-limits";
import { linkDisplay } from "./link-display";

function itemLabel(item: ContactItem) {
  if (isAttachmentType(item.type) && item.label.trim()) return item.label.trim();
  return typeLabel(item.type);
}

async function drawNextScanAddon(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument["addPage"]>,
  y: number,
  addon: NextScanAddon,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
): Promise<number> {
  if (addon.type === "selfie") {
    try {
      const image = await embedPhoto(pdfDoc, addon.content);
      const size = 72;
      page.drawImage(image, { x: 50, y: y - size, width: size, height: size });
      return y - size - 16;
    } catch {
      /* fall through */
    }
  }

  const label = addon.type === "voice" ? "Voice note" : addon.type === "selfie" ? "Selfie" : "Note";
  page.drawText(label, { x: 50, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(addon.content.slice(0, 400), {
    x: 50,
    y: y - 14,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
    maxWidth: 495,
  });
  return y - 36;
}

async function embedPhoto(pdfDoc: PDFDocument, dataUrl: string) {
  const base64 = dataUrl.split(",")[1];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (dataUrl.includes("image/png")) return pdfDoc.embedPng(bytes);
  return pdfDoc.embedJpg(bytes);
}

export async function generateCardPdf(snapshot: CardSnapshot): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 780;

  if (snapshot.photo) {
    try {
      const image = await embedPhoto(pdfDoc, snapshot.photo);
      const size = 80;
      page.drawImage(image, {
        x: (595 - size) / 2,
        y: y - size,
        width: size,
        height: size,
      });
      y -= size + 24;
    } catch {
      /* skip broken photo */
    }
  }

  page.drawText(snapshot.displayName.replace(/\n/g, " "), {
    x: 50,
    y,
    size: 22,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
    maxWidth: 495,
  });
  y -= 28;

  if (snapshot.title.trim()) {
    page.drawText(snapshot.title, {
      x: 50,
      y,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.4),
      maxWidth: 495,
    });
    y -= 32;
  }

  page.drawLine({
    start: { x: 50, y },
    end: { x: 545, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 24;

  const nextScanAddons = snapshot.nextScanAddons ?? [];
  if (nextScanAddons.length > 0) {
    if (y < 120) {
      page = pdfDoc.addPage([595, 842]);
      y = 780;
    }

    page.drawText("Next scan", {
      x: 50,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.45, 0.45, 0.45),
    });
    y -= 20;

    for (const addon of nextScanAddons) {
      if (y < 100) {
        page = pdfDoc.addPage([595, 842]);
        y = 780;
      }
      y = await drawNextScanAddon(pdfDoc, page, y, addon, font, fontBold);
    }

    y -= 12;
    page.drawLine({
      start: { x: 50, y },
      end: { x: 545, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 24;
  }

  for (const item of snapshot.items) {
    if (y < 80) {
      y = 780;
      page = pdfDoc.addPage([595, 842]);
    }

    page.drawText(itemLabel(item), {
      x: 50,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 16;

    page.drawText(linkDisplay(item).slice(0, 400), {
      x: 50,
      y,
      size: 10,
      font,
      color: rgb(0.2, 0.35, 0.7),
      maxWidth: 495,
    });
    y -= 28;
  }

  return pdfDoc.save();
}

export function cardPdfFilename(snapshot: CardSnapshot) {
  const safeName = snapshot.displayName.replace(/\n/g, " ").replace(/[^\w\s-]/g, "").trim();
  return `${safeName || "compass-card"}.pdf`;
}
