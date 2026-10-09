"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cardSheetsToPdf } from "@/shared/services/card-pdf-file";
import { applyPdfPhotoLook } from "@/shared/lib/photo-look";
import { cardPdfFilename } from "@/shared/services/card-pdf-name";
import { beginCardPdf, failCardPdf, publishCardPdf, type CardPdfInput } from "@/shared/services/save-public-card-pdf";
import {
  blockHeights,
  packPdfBlocks,
  pullPdfUnit,
  pushPdfUnit,
  PDF_PAGE_H,
  PDF_PAGE_TAIL,
  PDF_PAGE_W,
  type PdfFlowBlock,
  type PdfFlowSlice,
  type PdfSectionSlice,
} from "@/shared/services/pdf-pages";

type CardPdfSourceProps = {
  input: CardPdfInput;
  /** Bumps when the saved card changes, so the hidden sheets are painted again. */
  epoch: number;
  children: (mask: number[] | null) => ReactNode;
};

type LineCut = { start: number; end: number; height: number; paragraph: number };

type MeasuredCard = {
  blocks: PdfFlowBlock[];
  elements: HTMLElement[];
  cuts: (LineCut[][] | null)[];
};

function waitFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

async function waitForPaint(root: HTMLElement) {
  await document.fonts?.ready;
  await waitFrames(2);
  const images = [...root.querySelectorAll("img")];
  await Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : image.decode().catch(() => undefined),
    ),
  );
}

function px(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function longestText(root: HTMLElement): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let best: Text | null = null;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (!best || text.data.length > best.data.length) best = text;
    node = walker.nextNode();
  }
  return best;
}

function charTop(node: Text, index: number): number | null {
  if (index < 0 || index >= node.data.length) return null;
  const range = document.createRange();
  range.setStart(node, index);
  range.setEnd(node, index + 1);
  const rect = range.getClientRects()[0];
  return rect ? rect.top : null;
}

function isSpace(char: string | undefined) {
  return char != null && /\s/.test(char);
}

/** A break already sits on a space, or at either end of the paragraph. */
function atWordBreak(text: string, index: number) {
  if (index <= 0 || index >= text.length) return true;
  return isSpace(text[index - 1]) || isSpace(text[index]);
}

/**
 * The visual line can end one letter into the next word.
 * Pull that letter back so the whole word starts the next line.
 * A word longer than the line stays cut, without an inserted hyphen.
 */
function snapLineEnd(text: string, start: number, end: number, limit: number) {
  if (end >= limit || atWordBreak(text, end)) return end;
  let index = end;
  while (index > start && !isSpace(text[index - 1])) index -= 1;
  return index > start ? index : end;
}

/** Exclusive end of the visual line that starts at `start`, not past `limit`. */
function exclusiveEndOfLine(node: Text, start: number, limit: number): number {
  const origin = charTop(node, start);
  if (origin == null) return Math.min(start + 1, limit);
  let lo = start + 1;
  let hi = limit;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const top = charTop(node, mid - 1);
    if (top == null || top <= origin + 2) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(lo, start + 1);
}

function measureLines(body: HTMLElement, node: Text): LineCut[] | null {
  const text = node.data;
  if (!text) return null;
  const bodyRect = body.getBoundingClientRect();
  const lineHeight = Math.max(1, Math.ceil(px(getComputedStyle(body).lineHeight) || bodyRect.height || 1));
  const paragraphs: { start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      paragraphs.push({ start: cursor, end: i });
      cursor = i + 1;
    }
  }
  const raw: { start: number; end: number; paragraph: number; top: number | null }[] = [];
  paragraphs.forEach((para, paragraph) => {
    if (para.start >= para.end) {
      raw.push({ start: para.start, end: para.end, paragraph, top: null });
      return;
    }
    let at = para.start;
    while (at < para.end) {
      const end = snapLineEnd(text, at, exclusiveEndOfLine(node, at, para.end), para.end);
      raw.push({ start: at, end, paragraph, top: charTop(node, at) });
      if (end <= at) break;
      at = end;
    }
  });
  if (raw.length <= 1) return null;
  const tops: number[] = [];
  for (const line of raw) {
    if (line.top != null) tops.push(line.top);
    else tops.push((tops[tops.length - 1] ?? bodyRect.top) + lineHeight);
  }
  const lines = raw.map((line, index) => {
    const top = index === 0 ? bodyRect.top : tops[index];
    const bottom = index + 1 < raw.length ? tops[index + 1] : bodyRect.bottom;
    return {
      start: line.start,
      end: line.end,
      paragraph: line.paragraph,
      height: Math.max(1, Math.ceil(bottom - top)),
    };
  });
  const rowHeight = Math.max(1, Math.ceil(bodyRect.height));
  const used = lines.slice(0, -1).reduce((sum, line) => sum + line.height, 0);
  lines[lines.length - 1].height = Math.max(1, rowHeight - used);
  return lines;
}

function measureRow(row: HTMLElement): LineCut[] | null {
  const body = row.querySelector<HTMLElement>(".t-body");
  if (!body) return null;
  const node = longestText(body);
  if (!node) return null;
  const lines = measureLines(body, node);
  if (!lines) return null;
  const rowHeight = Math.max(1, Math.ceil(row.getBoundingClientRect().height));
  const used = lines.slice(0, -1).reduce((sum, line) => sum + line.height, 0);
  lines[lines.length - 1].height = Math.max(1, rowHeight - used);
  return lines;
}

function collectCard(root: HTMLElement): MeasuredCard {
  const blocks: PdfFlowBlock[] = [];
  const elements: HTMLElement[] = [];
  const cuts: (LineCut[][] | null)[] = [];
  for (const node of root.querySelectorAll<HTMLElement>("[data-pdf-block]")) {
    const rowEls = node.dataset.rubric ? [...node.querySelectorAll<HTMLElement>("[data-reorder-row]")] : [];
    if (!node.dataset.rubric || rowEls.length === 0) {
      const height = blockHeights([node])[0] ?? Math.ceil(node.getBoundingClientRect().height);
      blocks.push({ kind: "whole", height });
      elements.push(node);
      cuts.push(null);
      continue;
    }
    const style = getComputedStyle(node);
    const label = node.querySelector<HTMLElement>(".t-label");
    const advances = blockHeights(rowEls);
    const rowCuts: LineCut[][] = [];
    const rows = rowEls.map((row, index) => {
      const height = Math.max(1, Math.ceil(row.getBoundingClientRect().height));
      const gapBefore = index === 0 ? 0 : Math.max(0, advances[index] - height);
      const lines = measureRow(row);
      rowCuts.push(lines ?? []);
      return {
        height,
        gapBefore,
        lines: lines?.map((line) => ({ height: line.height, paragraph: line.paragraph })),
      };
    });
    blocks.push({
      kind: "section",
      labelHeight: label ? Math.ceil(label.getBoundingClientRect().height) : 0,
      padTop: Math.ceil(px(style.paddingTop)),
      padBottom: Math.ceil(px(style.paddingBottom)),
      border: Math.ceil(px(style.borderBottomWidth)),
      rows,
    });
    elements.push(node);
    cuts.push(rowCuts);
  }
  return { blocks, elements, cuts };
}

function applyCut(row: HTMLElement, lines: LineCut[] | undefined, from: number, to: number) {
  if (!lines || lines.length === 0 || to <= from) return;
  if (from <= 0 && to >= lines.length) return;
  const body = row.querySelector<HTMLElement>(".t-body");
  const node = body ? longestText(body) : null;
  if (!node) return;
  const start = lines[from]?.start ?? 0;
  const end = lines[to - 1]?.end ?? start;
  const value = node.data.slice(start, end);
  node.data = value.length > 0 ? value : "\n";
}

function renderSection(source: HTMLElement, slice: PdfSectionSlice, rowCuts: LineCut[][] | null): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const rows = [...clone.querySelectorAll<HTMLElement>("[data-reorder-row]")];
  rows.forEach((row, index) => {
    if (index < slice.rowStart || index >= slice.rowEnd) {
      row.remove();
      return;
    }
    const lines = rowCuts?.[index];
    const from = index === slice.rowStart ? slice.lineStart : 0;
    const to = index === slice.rowEnd - 1 ? slice.lineEnd : (lines?.length ?? 0);
    if (lines && lines.length > 1) applyCut(row, lines, from, to);
  });
  if (!slice.tail) {
    clone.style.paddingBottom = "0px";
    clone.style.borderBottomWidth = "0px";
  }
  return clone;
}

function renderPages(article: HTMLElement, measured: MeasuredCard, pages: PdfFlowSlice[][]): HTMLElement[] {
  return pages.map((slices) => {
    const page = document.createElement("div");
    page.setAttribute("data-pdf-page", "");
    page.className = "flex shrink-0 flex-col overflow-hidden bg-white";
    page.style.width = `${PDF_PAGE_W}px`;
    page.style.height = `${PDF_PAGE_H}px`;
    const clone = article.cloneNode(true) as HTMLElement;
    const pad = clone.querySelector("[data-pdf-block]")?.parentElement;
    if (!pad) {
      page.appendChild(clone);
      return page;
    }
    pad.setAttribute("data-pdf-sheet", "");
    for (const block of [...clone.querySelectorAll("[data-pdf-block]")]) block.remove();
    clone.querySelector("[data-card-chip-list]")?.remove();
    for (const slice of slices) {
      const source = measured.elements[slice.index];
      if (!source) continue;
      if (slice.kind === "whole") {
        pad.appendChild(source.cloneNode(true));
        continue;
      }
      pad.appendChild(renderSection(source, slice, measured.cuts[slice.index] ?? null));
    }
    page.appendChild(clone);
    return page;
  });
}

function pageContentHeight(page: HTMLElement): number {
  const pad = page.querySelector<HTMLElement>("[data-pdf-sheet]");
  if (!pad) return Math.ceil(page.scrollHeight);
  return Math.ceil(pad.scrollHeight);
}

function mountPages(host: HTMLElement, pages: HTMLElement[]) {
  host.replaceChildren(...pages);
}

/**
 * After the height estimate, keep a sheet from clipping and from sitting
 * more than ~30% empty while the next section can still give a line.
 */
function settlePages(
  host: HTMLElement,
  article: HTMLElement,
  measured: MeasuredCard,
  pages: PdfFlowSlice[][],
): HTMLElement[] {
  const closed = new Set<number>();
  let built = renderPages(article, measured, pages);
  mountPages(host, built);
  for (let step = 0; step < 400; step++) {
    const heights = built.map(pageContentHeight);
    const overflowAt = heights.findIndex((height) => height > PDF_PAGE_H + 1);
    if (overflowAt >= 0) {
      if (!pushPdfUnit(pages, measured.blocks, overflowAt)) break;
      closed.clear();
      built = renderPages(article, measured, pages);
      mountPages(host, built);
      continue;
    }
    let pulled = false;
    for (let index = 0; index < pages.length - 1; index++) {
      if (closed.has(index)) continue;
      const gap = PDF_PAGE_H - heights[index];
      if (gap <= PDF_PAGE_H * PDF_PAGE_TAIL) continue;
      if (!pullPdfUnit(pages, measured.blocks, index)) {
        closed.add(index);
        continue;
      }
      const trial = renderPages(article, measured, pages);
      mountPages(host, trial);
      if (pageContentHeight(trial[index]) > PDF_PAGE_H + 1) {
        pushPdfUnit(pages, measured.blocks, index);
        closed.add(index);
        built = renderPages(article, measured, pages);
        mountPages(host, built);
        continue;
      }
      built = trial;
      closed.clear();
      pulled = true;
      break;
    }
    if (!pulled) return built;
  }
  return built;
}

/**
 * Hidden print of the public card. Pages are the same component as `/c/`.
 * The sky plaque sits under the portfolio name, inside that same block.
 * A long section breaks on its rows, and on the lines of a tall paragraph.
 */
export function CardPdfSource({ input, epoch, children }: CardPdfSourceProps) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const cacheKey = `${input.publicToken}\n${input.revision ?? ""}\n${input.displayName}\n${epoch}\n${(input.notes ?? [])
    .map((note) => `${note.id}:${note.type}:${note.attachmentId ?? ""}:${note.content}`)
    .join("|")}`;

  useEffect(() => {
    beginCardPdf(inputRef.current);
  }, [cacheKey]);

  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    let cancel = false;
    const pagesHost = document.createElement("div");
    pagesHost.setAttribute("aria-hidden", "true");
    pagesHost.className = "pointer-events-none fixed top-0 -z-10";
    pagesHost.style.left = `${-PDF_PAGE_W - 32}px`;
    document.body.appendChild(pagesHost);

    void (async () => {
      try {
        await waitForPaint(source);
        if (cancel || !sourceRef.current) return;
        const article = source.querySelector("article");
        if (!article) {
          failCardPdf(inputRef.current, new Error("The card has nothing to print"));
          return;
        }
        article.style.hyphens = "none";
        article.style.setProperty("-webkit-hyphens", "none");
        const measured = collectCard(source);
        if (measured.blocks.length === 0) {
          failCardPdf(inputRef.current, new Error("The card has nothing to print"));
          return;
        }
        const pages = packPdfBlocks(measured.blocks, PDF_PAGE_H);
        const built = settlePages(pagesHost, article, measured, pages);
        await waitForPaint(pagesHost);
        if (cancel) return;
        const sheets = [...pagesHost.querySelectorAll<HTMLElement>("[data-pdf-page]")];
        const painted = sheets.length > 0 ? sheets : built;
        if (painted.length === 0) {
          failCardPdf(inputRef.current, new Error("The card has nothing to print"));
          return;
        }
        applyPdfPhotoLook(pagesHost);
        const bytes = await cardSheetsToPdf(painted);
        if (cancel) return;
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const current = inputRef.current;
        publishCardPdf(current, {
          blob: new Blob([copy], { type: "application/pdf" }),
          filename: cardPdfFilename(current.displayName),
        });
      } catch (error) {
        if (!cancel) failCardPdf(inputRef.current, error);
      }
    })();

    return () => {
      cancel = true;
      pagesHost.remove();
    };
  }, [cacheKey]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed top-0 -z-10" style={{ left: -PDF_PAGE_W - 32 }}>
      <div ref={sourceRef} style={{ width: PDF_PAGE_W }}>
        {children(null)}
      </div>
    </div>,
    document.body,
  );
}
