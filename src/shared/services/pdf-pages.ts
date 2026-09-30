/** Phone sheet. Matches a 390×844 viewport, not A4. */
export const PDF_PAGE_W = 390;
export const PDF_PAGE_H = 844;
/** `/c/` inset on a 390px phone: clamp(24px, 6.1vw, 28px) − 3mm. */
export const PDF_PAD = 24 - (3 * 96) / 25.4;
/** Sky plaque under the last sheet. */
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

/**
 * Pack blocks onto phone sheets.
 * Earlier sheets use the full height. The last sheet keeps room for the sky plaque.
 * A block taller than that room stays on its own sheet, and the plaque moves to a following sheet.
 */
export function packPdfBlocks(heights: number[], pageHeight: number, bandHeight: number): number[][] {
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

  const heightOf = (indexes: number[]) => indexes.reduce((sum, index) => sum + (heights[index] ?? 0), 0);
  const limit = pageHeight - bandHeight;
  while (heightOf(pages[pages.length - 1] ?? []) > limit && (pages[pages.length - 1]?.length ?? 0) > 1) {
    const moved = pages[pages.length - 1]?.pop();
    if (moved == null) break;
    pages.push([moved]);
  }
  if (heightOf(pages[pages.length - 1] ?? []) > limit) pages.push([]);
  return pages;
}
