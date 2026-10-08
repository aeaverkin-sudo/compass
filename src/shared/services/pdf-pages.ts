/** Phone sheet. Matches a 390×844 viewport, not A4. */
export const PDF_PAGE_W = 390;
export const PDF_PAGE_H = 844;
/** `/c/` inset on a 390px phone: clamp(24px, 6.1vw, 28px) − 3mm. */
export const PDF_PAD = 24 - (3 * 96) / 25.4;

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

/**
 * Vertical advance of each element, top to bottom.
 * A box that overlaps the one above it (a section title beside its first row)
 * only counts the part that sticks out below.
 */
export function blockHeights(blocks: HTMLElement[]): number[] {
  if (blocks.length === 0) return [];
  let cursor = blocks[0].getBoundingClientRect().top;
  return blocks.map((block) => {
    const rect = block.getBoundingClientRect();
    const bottom = Math.max(cursor, rect.bottom);
    const advance = Math.ceil(bottom - cursor);
    cursor = bottom;
    return advance;
  });
}

/** A page may not keep more than this fraction empty when the next section can be cut onto it. */
export const PDF_PAGE_TAIL = 0.3;

export type PdfFlowLine = {
  height: number;
  /** Lines that share a paragraph stay together until the paragraph itself does not fit. */
  paragraph: number;
};

export type PdfFlowRow = {
  height: number;
  gapBefore: number;
  /** Absent or a single line: the row stays whole. */
  lines?: PdfFlowLine[];
};

/** Header, notes, and the sky footer. They are not cut. */
export type PdfWholeBlock = { kind: "whole"; height: number };

/** A section title plus each value row. The title is not a separate page piece. */
export type PdfSectionBlock = {
  kind: "section";
  labelHeight: number;
  padTop: number;
  padBottom: number;
  border: number;
  rows: PdfFlowRow[];
};

export type PdfFlowBlock = PdfWholeBlock | PdfSectionBlock;

export type PdfSectionSlice = {
  kind: "section";
  index: number;
  rowStart: number;
  rowEnd: number;
  lineStart: number;
  lineEnd: number;
  tail: boolean;
};

export type PdfFlowSlice = { kind: "whole"; index: number } | PdfSectionSlice;

type RowCursor = { row: number; line: number };

function lineCount(row: PdfFlowRow): number {
  return Math.max(1, row.lines?.length ?? 1);
}

function rowSplits(row: PdfFlowRow): boolean {
  return (row.lines?.length ?? 0) > 1;
}

function portion(row: PdfFlowRow, from: number, to: number): number {
  if (!rowSplits(row) || !row.lines) return row.height;
  let sum = 0;
  for (let i = from; i < to; i++) sum += row.lines[i]?.height ?? 0;
  return sum;
}

function reachesEnd(block: PdfSectionBlock, slice: Pick<PdfSectionSlice, "rowEnd" | "lineEnd">): boolean {
  const lastRow = block.rows.length - 1;
  if (lastRow < 0 || slice.rowEnd - 1 !== lastRow) return false;
  return slice.lineEnd >= lineCount(block.rows[lastRow]);
}

/** Height of one page piece, including the repeated title when the slice is a section. */
export function pdfSliceHeight(block: PdfFlowBlock, slice: PdfFlowSlice): number {
  if (block.kind === "whole" || slice.kind === "whole") return block.kind === "whole" ? block.height : 0;
  let content = 0;
  for (let row = slice.rowStart; row < slice.rowEnd; row++) {
    const metric = block.rows[row];
    if (!metric) continue;
    const from = row === slice.rowStart ? slice.lineStart : 0;
    const to = row === slice.rowEnd - 1 ? slice.lineEnd : lineCount(metric);
    if (row > slice.rowStart) content += metric.gapBefore;
    content += portion(metric, from, to);
  }
  let height = block.padTop + Math.max(content, block.labelHeight);
  if (slice.tail) height += block.padBottom + block.border;
  return Math.ceil(height);
}

function minPiece(block: PdfSectionBlock, row: number, line: number): PdfSectionSlice {
  const metric = block.rows[row];
  if (!metric || !rowSplits(metric)) {
    return { kind: "section", index: -1, rowStart: row, rowEnd: row + 1, lineStart: 0, lineEnd: 1, tail: false };
  }
  return {
    kind: "section",
    index: -1,
    rowStart: row,
    rowEnd: row + 1,
    lineStart: line,
    lineEnd: line + 1,
    tail: false,
  };
}

function withTail(block: PdfSectionBlock, slice: PdfSectionSlice): PdfSectionSlice {
  return { ...slice, tail: reachesEnd(block, slice) };
}

function lastRowComplete(block: PdfSectionBlock, slice: PdfSectionSlice): boolean {
  const last = slice.rowEnd - 1;
  const metric = block.rows[last];
  if (!metric) return true;
  return slice.lineEnd >= lineCount(metric);
}

function extendParagraph(block: PdfSectionBlock, slice: PdfSectionSlice): PdfSectionSlice | null {
  if (lastRowComplete(block, slice)) return null;
  const metric = block.rows[slice.rowEnd - 1];
  const lines = metric?.lines;
  if (!lines || slice.lineEnd >= lines.length) return null;
  const paragraph = lines[slice.lineEnd]?.paragraph;
  let end = slice.lineEnd;
  while (end < lines.length && lines[end]?.paragraph === paragraph) end += 1;
  if (end === slice.lineEnd) return null;
  return { ...slice, lineEnd: end };
}

function extendLine(block: PdfSectionBlock, slice: PdfSectionSlice): PdfSectionSlice | null {
  if (lastRowComplete(block, slice)) return null;
  const metric = block.rows[slice.rowEnd - 1];
  if (!metric || !rowSplits(metric) || slice.lineEnd >= lineCount(metric)) return null;
  return { ...slice, lineEnd: slice.lineEnd + 1 };
}

function extendRow(block: PdfSectionBlock, slice: PdfSectionSlice): PdfSectionSlice | null {
  if (!lastRowComplete(block, slice)) return null;
  const next = slice.rowEnd;
  if (next >= block.rows.length) return null;
  return { ...slice, rowEnd: next + 1, lineEnd: 1 };
}

function fitSlice(block: PdfSectionBlock, row: number, line: number, avail: number): PdfSectionSlice | null {
  const heightOf = (slice: PdfSectionSlice) => pdfSliceHeight(block, withTail(block, slice));
  const min = minPiece(block, row, line);
  if (heightOf(min) > avail) return null;
  let best = min;
  let guard = 0;
  while (guard++ < 10000) {
    const paragraph = extendParagraph(block, best);
    if (paragraph) {
      if (heightOf(paragraph) <= avail) {
        best = paragraph;
        continue;
      }
      let inner = 0;
      while (inner++ < 10000) {
        const one = extendLine(block, best);
        if (!one || heightOf(one) > avail) return withTail(block, best);
        best = one;
      }
      break;
    }
    const nextRow = extendRow(block, best);
    if (!nextRow || heightOf(nextRow) > avail) break;
    best = nextRow;
  }
  return withTail(block, best);
}

function nextCursor(block: PdfSectionBlock, slice: PdfSectionSlice): RowCursor {
  const last = slice.rowEnd - 1;
  const metric = block.rows[last];
  if (!metric || slice.lineEnd >= lineCount(metric)) return { row: slice.rowEnd, line: 0 };
  return { row: last, line: slice.lineEnd };
}

/**
 * Pack a card onto phone sheets.
 * A section title never sits alone at the bottom: it travels with the first row on that page.
 * A row that is taller than the room left is cut on a paragraph, then on a visual line.
 * Header, notes, and the footer stay whole.
 */
export function packPdfBlocks(blocks: PdfFlowBlock[], pageHeight: number): PdfFlowSlice[][] {
  const pages: PdfFlowSlice[][] = [];
  let page: PdfFlowSlice[] = [];
  let used = 0;
  const flush = () => {
    if (page.length === 0) return;
    pages.push(page);
    page = [];
    used = 0;
  };

  blocks.forEach((block, index) => {
    if (block.kind === "whole") {
      if (page.length > 0 && used + block.height > pageHeight) flush();
      page.push({ kind: "whole", index });
      used += block.height;
      return;
    }
    if (block.rows.length === 0) return;
    let row = 0;
    let line = 0;
    let guard = 0;
    while (row < block.rows.length && guard++ < 10000) {
      const avail = pageHeight - used;
      const fit = fitSlice(block, row, line, avail);
      const piece = fit ?? (page.length === 0 ? withTail(block, minPiece(block, row, line)) : null);
      if (!piece) {
        flush();
        continue;
      }
      const slice = { ...piece, index };
      const height = pdfSliceHeight(block, slice);
      page.push(slice);
      used += height;
      const next = nextCursor(block, slice);
      if (next.row === row && next.line === line) break;
      row = next.row;
      line = next.line;
      if (row < block.rows.length && used >= pageHeight) flush();
    }
  });
  flush();
  if (pages.length === 0) pages.push([]);
  return pages;
}

type TextUnit = { index: number; row: number; line: number; whole: boolean };

function unitsOf(slice: PdfSectionSlice, block: PdfSectionBlock): TextUnit[] {
  const units: TextUnit[] = [];
  for (let row = slice.rowStart; row < slice.rowEnd; row++) {
    const metric = block.rows[row];
    if (!metric) continue;
    const from = row === slice.rowStart ? slice.lineStart : 0;
    const to = row === slice.rowEnd - 1 ? slice.lineEnd : lineCount(metric);
    if (!rowSplits(metric)) {
      units.push({ index: slice.index, row, line: 0, whole: true });
      continue;
    }
    for (let line = from; line < to; line++) units.push({ index: slice.index, row, line, whole: false });
  }
  return units;
}

function unitFollows(block: PdfSectionBlock, prev: TextUnit, next: TextUnit): boolean {
  if (prev.index !== next.index) return false;
  const metric = block.rows[prev.row];
  if (!metric) return false;
  if (prev.whole) return next.row === prev.row + 1 && next.line === 0;
  if (next.row === prev.row && next.line === prev.line + 1) return true;
  return next.row === prev.row + 1 && next.line === 0 && prev.line === lineCount(metric) - 1;
}

function sliceFromUnits(units: TextUnit[], block: PdfSectionBlock): PdfSectionSlice | null {
  if (units.length === 0) return null;
  const first = units[0];
  const last = units[units.length - 1];
  const slice: PdfSectionSlice = {
    kind: "section",
    index: first.index,
    rowStart: first.row,
    rowEnd: last.row + 1,
    lineStart: first.whole ? 0 : first.line,
    lineEnd: last.whole ? 1 : last.line + 1,
    tail: false,
  };
  slice.tail = reachesEnd(block, slice);
  return slice;
}

function regroup(slices: PdfFlowSlice[], blocks: PdfFlowBlock[]): PdfFlowSlice[] {
  const out: PdfFlowSlice[] = [];
  for (const slice of slices) {
    const prev = out[out.length - 1];
    if (slice.kind === "section" && prev?.kind === "section" && prev.index === slice.index) {
      const block = blocks[slice.index];
      if (block?.kind === "section") {
        const left = unitsOf(prev, block);
        const right = unitsOf(slice, block);
        const joined = left.length > 0 && right.length > 0 && unitFollows(block, left[left.length - 1], right[0]);
        const merged = joined ? sliceFromUnits(left.concat(right), block) : null;
        if (merged) {
          out[out.length - 1] = merged;
          continue;
        }
      }
    }
    out.push(slice);
  }
  return out;
}

function sectionBlock(blocks: PdfFlowBlock[], index: number): PdfSectionBlock | null {
  const block = blocks[index];
  return block?.kind === "section" ? block : null;
}

/** Move one row-line from the end of this page onto the next. A lone header or footer stays. */
export function pushPdfUnit(pages: PdfFlowSlice[][], blocks: PdfFlowBlock[], pageIndex: number): boolean {
  const page = pages[pageIndex];
  if (!page || page.length === 0) return false;
  const last = page[page.length - 1];
  let moved: PdfFlowSlice | null = null;
  if (last.kind === "whole") {
    if (page.length === 1) return false;
    moved = page.pop() ?? null;
  } else {
    const block = sectionBlock(blocks, last.index);
    if (!block) return false;
    const units = unitsOf(last, block);
    if (units.length === 0) return false;
    if (units.length === 1) {
      if (page.length === 1) return false;
      moved = page.pop() ?? null;
    } else {
      const kept = sliceFromUnits(units.slice(0, -1), block);
      const tail = sliceFromUnits(units.slice(-1), block);
      if (!kept || !tail) return false;
      page[page.length - 1] = kept;
      moved = tail;
    }
  }
  if (!moved) return false;
  const next = pages[pageIndex + 1] ?? [];
  pages[pageIndex + 1] = regroup([moved, ...next], blocks);
  if (page.length === 0) pages.splice(pageIndex, 1);
  return true;
}

/** Move one row-line from the next page back onto this one. */
export function pullPdfUnit(pages: PdfFlowSlice[][], blocks: PdfFlowBlock[], pageIndex: number): boolean {
  const next = pages[pageIndex + 1];
  if (!next || next.length === 0) return false;
  const page = pages[pageIndex];
  if (!page) return false;
  const first = next[0];
  let moved: PdfFlowSlice | null = null;
  if (first.kind === "whole") {
    moved = next.shift() ?? null;
  } else {
    const block = sectionBlock(blocks, first.index);
    if (!block) return false;
    const units = unitsOf(first, block);
    if (units.length === 0) return false;
    if (units.length === 1) {
      moved = next.shift() ?? null;
    } else {
      const head = sliceFromUnits(units.slice(0, 1), block);
      const rest = sliceFromUnits(units.slice(1), block);
      if (!head || !rest) return false;
      moved = head;
      next[0] = rest;
    }
  }
  if (!moved) return false;
  if (next.length === 0) pages.splice(pageIndex + 1, 1);
  page.push(moved);
  pages[pageIndex] = regroup(page, blocks);
  return true;
}
