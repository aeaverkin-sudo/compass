import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PortfolioSnapshot } from "@/shared/types";

async function embedPhoto(pdfDoc: PDFDocument, dataUrl: string) {
  const base64 = dataUrl.split(",")[1];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (dataUrl.includes("image/png")) return pdfDoc.embedPng(bytes);
  return pdfDoc.embedJpg(bytes);
}

export async function downloadPortfolioPdf(snapshot: PortfolioSnapshot) {
  const pdfDoc = await PDFDocument.create();
  let currentPage = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const fullName = [snapshot.firstName, snapshot.lastName].filter(Boolean).join(" ");
  let y = 780;

  if (snapshot.photo) {
    try {
      const image = await embedPhoto(pdfDoc, snapshot.photo);
      const size = 80;
      currentPage.drawImage(image, {
        x: (595 - size) / 2,
        y: y - size,
        width: size,
        height: size,
      });
      y -= size + 24;
    } catch {
      /* skip photo if embed fails */
    }
  }

  currentPage.drawText(fullName || snapshot.name, {
    x: 50,
    y,
    size: 22,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
    maxWidth: 495,
  });
  y -= 28;

  if (snapshot.description) {
    currentPage.drawText(snapshot.description.slice(0, 500), {
      x: 50,
      y,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.4),
      maxWidth: 495,
    });
    y -= 40;
  }

  y -= 10;
  currentPage.drawLine({
    start: { x: 50, y },
    end: { x: 545, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 24;

  for (const slot of snapshot.slots) {
    if (y < 80) {
      y = 780;
      currentPage = pdfDoc.addPage([595, 842]);
    }
    currentPage.drawText(slot.label, {
      x: 50,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 16;

    if (slot.type === "link") {
      currentPage.drawText(slot.value, {
        x: 50,
        y,
        size: 10,
        font,
        color: rgb(0.2, 0.35, 0.7),
        maxWidth: 495,
      });
      y -= 20;
    } else if (slot.type === "text") {
      currentPage.drawText(slot.value.slice(0, 400), {
        x: 50,
        y,
        size: 10,
        font,
        color: rgb(0.35, 0.35, 0.35),
        maxWidth: 495,
      });
      y -= 28;
    } else {
      currentPage.drawText(`[${slot.type}]`, {
        x: 50,
        y,
        size: 10,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      y -= 20;
    }
    y -= 8;
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const safeName = (fullName || snapshot.name || "portfolio").replace(/[^\w\s-]/g, "").trim();
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName || "portfolio"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
