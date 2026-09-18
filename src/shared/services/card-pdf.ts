import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CardSnapshot, ContactItem } from "@/shared/types";

function typeLabel(type: ContactItem["type"]) {
  const map: Record<ContactItem["type"], string> = {
    instagram: "Instagram",
    linkedin: "LinkedIn",
    website: "Website",
    email: "Email",
    phone: "Phone",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    link: "Link",
    text: "Note",
    custom: "Contact",
  };
  return map[type];
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

  page.drawText(snapshot.displayName, {
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

  for (const item of snapshot.items) {
    if (y < 80) {
      y = 780;
      page = pdfDoc.addPage([595, 842]);
    }

    page.drawText(typeLabel(item.type), {
      x: 50,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 16;

    page.drawText(item.value.slice(0, 400), {
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
  const safeName = snapshot.displayName.replace(/[^\w\s-]/g, "").trim();
  return `${safeName || "compass-card"}.pdf`;
}
