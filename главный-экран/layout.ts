/** Layout offsets from the physical screen top (viewport-fit: cover). */

/** ~10% under 168 so the card picks up the freed space. */
export const QR_SIZE = 134;
/** Dark apelsin orange — vivid but enough contrast on white for phone scanners. */
export const QR_COLOR = "#E8640C";

/** Browse card photo — 70% of QR size, ~0.5 cm below card top edge. */
export const CARD_PHOTO_SIZE_PX = 118;
export const CARD_PHOTO_TOP_PX = 19;
export const CARD_PHOTO_RADIUS_PX = 21;

/** Card name — 21px, weight 500. */
export const CARD_HEADER_NAME_SIZE_PX = 21;
export const CARD_NAME_GAP_PX = 8;

/** Gap from the safe area to the QR. The Dynamic Island sits ~11px above that inset. */
export const QR_GAP_SYMMETRIC_PX = 18;
/** Extra drop so the first rule sits as far below the QR as the island sits above it. */
export const QR_TO_LINE_EXTRA_PX = 11;

/** Browse card bottom ≈ this % of viewport (green mockup outline). */
export const CARD_BOTTOM_TARGET_LVH = 73;

/** Trim browse card bottom edge (px; negative extends downward). −84 = prior −46 plus +1 cm. */
export const CARD_BOTTOM_RAISE_PX = -84;

/** Base overlap of the library preview onto the QR zone. */
export const QR_OVERLAP_LIBRARY_BASE_PX = 112;

/** ~0.5 cm — preview rises and covers the QR more; fill panel gains the same height. */
export const LIBRARY_QR_OVERLAP_EXTRA_PX = 19;

export const QR_OVERLAP_LIBRARY_PX =
  QR_OVERLAP_LIBRARY_BASE_PX + LIBRARY_QR_OVERLAP_EXTRA_PX;

/** Library split below QR overlap — card ~50%, content sheet ~50%. */
export const LIBRARY_CARD_SHARE = 0.5;

export const SHEET_INSET = {
  browse: { horizontal: 14, bottom: 18, overlap: 22 },
  library: { horizontal: 14, bottom: 0, gap: 8 },
} as const;

/** compass-block / compass-library-list border width. */
export const PANEL_BORDER_WIDTH_PX = 1;

export const LAYER_TRANSITION_MS = 460;

/** A short sliver of the next card: past its side padding, not a second column of text. */
export const CARD_CAROUSEL_PEEK_PX = 34;
export const CARD_CAROUSEL_GAP_PX = 8;
export const MAX_CARDS = 2;

export function carouselSlideWidthPx(viewportWidth: number, multiSlide: boolean, edgeInsetPx: number = SHEET_INSET.browse.horizontal) {
  if (!multiSlide) return viewportWidth - edgeInsetPx * 2;
  return viewportWidth - 2 * CARD_CAROUSEL_PEEK_PX - CARD_CAROUSEL_GAP_PX;
}

export function carouselSidePaddingPx(viewportWidth: number, multiSlide: boolean, edgeInsetPx: number = SHEET_INSET.browse.horizontal) {
  if (!multiSlide) return edgeInsetPx;
  return (viewportWidth - carouselSlideWidthPx(viewportWidth, true)) / 2;
}

export type MainScreenMode = "browse" | "library";

export function layoutTop(offsetPx: number) {
  return `${offsetPx}px`;
}

export function browseStackTopPx(safeTop: number) {
  return safeTop + QR_GAP_SYMMETRIC_PX + QR_SIZE + QR_GAP_SYMMETRIC_PX + QR_TO_LINE_EXTRA_PX;
}

export function browseCardHeightPx(viewportH: number, safeTop: number) {
  return Math.round(
    (viewportH * CARD_BOTTOM_TARGET_LVH) / 100 - browseStackTopPx(safeTop) - CARD_BOTTOM_RAISE_PX,
  );
}

export function browseCardHeight() {
  const stackTopBelowSafe = QR_GAP_SYMMETRIC_PX + QR_SIZE + QR_GAP_SYMMETRIC_PX + QR_TO_LINE_EXTRA_PX;
  const bottomExtendPx = -CARD_BOTTOM_RAISE_PX;
  return `calc(${CARD_BOTTOM_TARGET_LVH}lvh - env(safe-area-inset-top) - ${stackTopBelowSafe}px + ${bottomExtendPx}px)`;
}

export function libraryStackTopPx(safeTop: number) {
  return safeTop + QR_GAP_SYMMETRIC_PX + QR_SIZE - QR_OVERLAP_LIBRARY_PX;
}

export function libraryStackHeightPx(viewportH: number, safeTop: number) {
  return viewportH - libraryStackTopPx(safeTop);
}

export function libraryCardHeightPx(viewportH: number, safeTop: number) {
  const stackHeight = libraryStackHeightPx(viewportH, safeTop);
  // Keep preview height stable; the extra overlap goes to the fill panel below.
  return Math.round((stackHeight - LIBRARY_QR_OVERLAP_EXTRA_PX) * LIBRARY_CARD_SHARE);
}

export function librarySheetTopPx(viewportH: number, safeTop: number) {
  return libraryStackTopPx(safeTop) + libraryCardHeightPx(viewportH, safeTop);
}
