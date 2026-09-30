import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

export { cardPdfFilename } from "@/shared/services/card-pdf-name";

/** Phone sheet, about 9:19.5. Not A4. */
const PAGE_W = 390;
const PAGE_H = 844;
const INK = rgb(0x11 / 255, 0x11 / 255, 0x11 / 255);

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

function loadRegularFont() {
  return readFile(path.join(FONT_DIR, "Arimo-Regular.ttf"));
}

/** One phone sheet for a frozen trial. The live card PDF is painted from `/c/` in the browser. */
export async function generateInactiveCardPdf(): Promise<Uint8Array> {
  const regular = await loadRegularFont();
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
