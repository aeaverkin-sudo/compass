import { PDFDocument, PDFString, type PDFPage } from "pdf-lib";
import { PDF_PAGE_H, PDF_PAGE_W } from "@/shared/services/pdf-pages";

type PageLink = { url: string; x: number; y: number; w: number; h: number };

function addUriLink(page: PDFPage, url: string, x: number, y: number, width: number, height: number) {
  if (width <= 0 || height <= 0) return;
  const annot = page.doc.context.register(
    page.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    }),
  );
  page.node.addAnnot(annot);
}

function linksOn(pageEl: HTMLElement): PageLink[] {
  const origin = pageEl.getBoundingClientRect();
  const links: PageLink[] = [];
  for (const anchor of pageEl.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = anchor.href;
    if (!href || href.startsWith("javascript:")) continue;
    const label = anchor.querySelector<HTMLElement>("[data-pdf-link]");
    const rect = (label ?? anchor).getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    links.push({
      url: href,
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      w: rect.width,
      h: rect.height,
    });
  }
  return links;
}

async function paintPage(pageEl: HTMLElement): Promise<{ bytes: Uint8Array; links: PageLink[] }> {
  const html2canvas = (await import("html2canvas-pro")).default;
  const links = linksOn(pageEl);
  const canvas = await html2canvas(pageEl, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
    width: PDF_PAGE_W,
    height: PDF_PAGE_H,
    onclone: (_document, element) => {
      element.style.position = "relative";
      element.style.left = "0";
      element.style.top = "0";
    },
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not paint the card");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), links };
}

/** One painted block, at the phone width, as tall as the snapshot. */
export async function snapshotToPdf(element: HTMLElement): Promise<Uint8Array> {
  const html2canvas = (await import("html2canvas-pro")).default;
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
    onclone: (_document, clone) => {
      clone.style.background = "#ffffff";
      clone.style.padding = "28px 24px";
    },
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not paint the page");
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
  const width = PDF_PAGE_W;
  const height = Math.max(1, Math.round((image.height / image.width) * width));
  const page = doc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return doc.save();
}

/** The card is already painted. pdf-lib only stores the sheets and the live links. */
export async function cardSheetsToPdf(pages: HTMLElement[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const pageEl of pages) {
    const painted = await paintPage(pageEl);
    const image = await doc.embedPng(painted.bytes);
    const page = doc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
    page.drawImage(image, { x: 0, y: 0, width: PDF_PAGE_W, height: PDF_PAGE_H });
    for (const link of painted.links) {
      addUriLink(page, link.url, link.x, PDF_PAGE_H - link.y - link.h, link.w, link.h);
    }
  }
  return doc.save();
}
