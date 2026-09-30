/** Phone sheet. Matches a 390×844 viewport, not A4. */
export const PDF_PAGE_W = 390;
export const PDF_PAGE_H = 844;
/** `/c/` inset on a 390px phone: clamp(24px, 6.1vw, 28px) − 3mm. */
export const PDF_PAD = 24 - (3 * 96) / 25.4;
/** Sky plaque directly under the portfolio name. */
export const PDF_BAND_H = 52;

export type PdfBlock =
  | { kind: "header" }
  | { kind: "zone"; id: string }
  | { kind: "notes" }
  | { kind: "footer" };

/** Same order the print card renders: header, zones, notes, footer. */
export function pdfBlockPlan(zoneIds: string[], hasNotes: boolean): PdfBlock[] {
  const blocks: PdfBlock[] = [{ kind: "header" }];
  for (const id of zoneIds) blocks.push({ kind: "zone", id });
  if (hasNotes) blocks.push({ kind: "notes" });
  blocks.push({ kind: "footer" });
  return blocks;
}

export function pdfNotesPresent(notes: { type: string }[] | undefined): boolean {
  return Boolean(notes?.some((note) => note.type === "text" || note.type === "selfie"));
}

/** Heights in DOM order, including the gap after the previous block. */
export function blockHeights(blocks: HTMLElement[]): number[] {
  if (blocks.length === 0) return [];
  let cursor = blocks[0].getBoundingClientRect().top;
  return blocks.map((block) => {
    const rect = block.getBoundingClientRect();
    const gap = Math.max(0, rect.top - cursor);
    cursor = rect.bottom;
    return Math.ceil(rect.height + gap);
  });
}

/** Pack blocks onto phone sheets. A block stays whole, so the name and the sky plaque travel together. */
export function packPdfBlocks(heights: number[], pageHeight: number): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;
  const push = () => {
    if (current.length === 0) return;
    pages.push(current);
    current = [];
    used = 0;
  };
  heights.forEach((height, index) => {
    if (current.length > 0 && used + height > pageHeight) push();
    current.push(index);
    used += height;
  });
  push();
  if (pages.length === 0) pages.push([]);
  return pages;
}
