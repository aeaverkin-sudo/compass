/** Layout offsets from the physical screen top (viewport-fit: cover). */

export const QR_SIZE = 168;
export const QR_COLOR = "#C1571F";

/** Browse card photo — 70% of QR size, ~0.5 cm below card top edge. */
export const CARD_PHOTO_SIZE_PX = 118;
export const CARD_PHOTO_TOP_PX = 19;
export const CARD_PHOTO_RADIUS_PX = 13;

/** Browse card name — ~0.2 cm below photo; matches draft card scale. */
export const CARD_NAME_SIZE_PX = 17;
export const CARD_NAME_GAP_PX = 8;

/** Library card photo — 2× previous 44px compact strip avatar. */
export const LIBRARY_PHOTO_SIZE_PX = 88;
export const LIBRARY_PHOTO_RADIUS_PX = 14;

/** Library stack — same top radius as browse card; bottom follows display curve. */
export const CARD_RADIUS_PX = 18;
export const LIBRARY_DISPLAY_RADIUS_PX = 22;

/** Equal gap: safe-area bottom → QR top, and QR bottom → card top. */
export const QR_GAP_SYMMETRIC_PX = 18;

/** Browse card bottom ≈ this % of viewport (green mockup outline). */
export const CARD_BOTTOM_TARGET_LVH = 73;

/** Trim browse card bottom edge (px; negative extends downward). −84 = prior −46 plus +1 cm. */
export const CARD_BOTTOM_RAISE_PX = -84;

export const QR_OVERLAP_LIBRARY_PX = 112;

/** Library split below QR overlap — card ~50%, content sheet ~50%. */
export const LIBRARY_CARD_SHARE = 0.5;

export const SHEET_INSET = {
  browse: { horizontal: 14, bottom: 18, overlap: 22 },
  library: { horizontal: 14, bottom: 0, gap: 8 },
} as const;

export const LAYER_TRANSITION_MS = 460;

/** Visible tail of the next card in browse carousel (keep small — max card size). */
export const CARD_CAROUSEL_PEEK_PX = 24;
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
  return safeTop + QR_GAP_SYMMETRIC_PX + QR_SIZE + QR_GAP_SYMMETRIC_PX;
}

export function browseCardHeightPx(viewportH: number, safeTop: number) {
  return Math.round(
    (viewportH * CARD_BOTTOM_TARGET_LVH) / 100 - browseStackTopPx(safeTop) - CARD_BOTTOM_RAISE_PX,
  );
}

export function browseCardHeight() {
  const stackTopBelowSafe = QR_GAP_SYMMETRIC_PX + QR_SIZE + QR_GAP_SYMMETRIC_PX;
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
  return Math.round(libraryStackHeightPx(viewportH, safeTop) * LIBRARY_CARD_SHARE);
}

export function librarySheetTopPx(viewportH: number, safeTop: number) {
  return libraryStackTopPx(safeTop) + libraryCardHeightPx(viewportH, safeTop);
}
