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

/** Library stack gap. */
export const QR_GAP_SYMMETRIC_PX = 18;
/** Gap that used to sit on each side of the rule under the QR. */
export const RULE_GAP_PX = QR_GAP_SYMMETRIC_PX + 96 / 25.4 / 2;
/** Sheet counter: t-label line (11 × 1.45) plus its mb-1. */
const SHEET_MARK_LINE_PX = 11 * 1.45;
const SHEET_MARK_MARGIN_PX = 4;
/** The plus hangs 6px above the photo; leave 2px between it and the counter. */
const SHEET_PHOTO_PAD_PX = 6 + 2 - SHEET_MARK_MARGIN_PX;
/** QR bottom → photo top, before the card was lifted: offset, counter, pad. */
const QR_TO_PHOTO_PX = RULE_GAP_PX + SHEET_MARK_LINE_PX + SHEET_MARK_MARGIN_PX + RULE_GAP_PX;
/** Half of that distance. The counter stays above the photo. */
export const PHOTO_BELOW_QR_PX = QR_TO_PHOTO_PX / 2;
export const SHEET_PHOTO_GAP_PX = SHEET_PHOTO_PAD_PX;
/** Where the browse card starts, so the photo lands on PHOTO_BELOW_QR_PX. */
export const CARD_BELOW_QR_PX =
  PHOTO_BELOW_QR_PX - SHEET_MARK_LINE_PX - SHEET_MARK_MARGIN_PX - SHEET_PHOTO_GAP_PX;
/** Browse QR, grown into the existing slot so it sits higher. The card does not move. */
export const BROWSE_QR_SIZE = 150;
/** Slot from the safe area to the rule: 18 + 134 + 18. */
export const HEADER_SLOT_PX = QR_GAP_SYMMETRIC_PX + QR_SIZE + QR_GAP_SYMMETRIC_PX;
/** Equal gap: island → QR, QR → rule, rule → photo. */
export const HEADER_RHYTHM_PX = (HEADER_SLOT_PX - BROWSE_QR_SIZE) / 2;

/** Browse card bottom ≈ this % of viewport (green mockup outline). */
export const CARD_BOTTOM_TARGET_LVH = 73;

/** Trim browse card bottom edge (px; negative extends downward). −84, then 4mm lower so the sky band is 2mm shorter. */
export const CARD_BOTTOM_RAISE_PX = -84 - (96 / 25.4) * 4;

/** Drop of the dots and OK. The card stays. */
export const BOTTOM_PLATE_DROP_PX = (96 / 25.4) * 3;
/** The sky plate starts this far below the card edge. */
export const BOTTOM_PLATE_LOWER_PX = (96 / 25.4) * 2;

/** Browse veils: solid white to clear in 3mm. Top and bottom share this. */
export const TOP_VEIL_PX = (96 / 25.4) * 3;

/** Base overlap of the library preview onto the QR zone. */
export const QR_OVERLAP_LIBRARY_BASE_PX = 112;

/** ~0.5 cm — preview rises and covers the QR more; fill panel gains the same height. */
export const LIBRARY_QR_OVERLAP_EXTRA_PX = 19;

export const QR_OVERLAP_LIBRARY_PX =
  QR_OVERLAP_LIBRARY_BASE_PX + LIBRARY_QR_OVERLAP_EXTRA_PX;

/** Library white top sits lower so the QR shows; 0.5 cm less than the first drop. */
export const LIBRARY_WHITE_TOP_DROP_PX = 29;
/** Fade from the new white edge down to the top of the name — one line higher. */
export const LIBRARY_NAME_FADE_PX = 11;

/** Library split below QR overlap — card ~50%, content sheet ~50%. */
export const LIBRARY_CARD_SHARE = 0.5;

export const SHEET_INSET = {
  browse: { horizontal: 14, bottom: 18, overlap: 22 },
  library: { horizontal: 14, bottom: 0, gap: 8 },
} as const;

/** compass-block / compass-library-list border width. */
export const PANEL_BORDER_WIDTH_PX = 1;

export const LAYER_TRANSITION_MS = 460;

/** Visible tail of the next card in browse carousel (keep small — max card size). */
export const CARD_CAROUSEL_PEEK_PX = 24;
export const CARD_CAROUSEL_GAP_PX = 8;

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

/** Slimmer than the full-screen remainder: 55% of (0.27 × lvh − 118px). */
const BAND_HEIGHT_SCALE = 0.55;

/**
 * Declared band height from the stable full screen (`lvh`), not the visible remainder.
 * Same number on one phone in the home-screen app, Safari and Chrome.
 */
export function browseBandHeightPx(fullH: number) {
  const share = (100 - CARD_BOTTOM_TARGET_LVH) / 100;
  const offset = -CARD_BOTTOM_RAISE_PX + BOTTOM_PLATE_LOWER_PX + TOP_VEIL_PX;
  return BAND_HEIGHT_SCALE * (fullH * share - offset);
}

/** Same height as `browseBandHeightPx`, for the plaque before the layout hook measures the screen. */
export function browseBandHeightCss() {
  const offset = -CARD_BOTTOM_RAISE_PX + BOTTOM_PLATE_LOWER_PX + TOP_VEIL_PX;
  return `calc(${BAND_HEIGHT_SCALE} * (${100 - CARD_BOTTOM_TARGET_LVH}lvh - ${offset}px))`;
}

export function browseCardHeight() {
  const stackTopBelowSafe = HEADER_RHYTHM_PX + BROWSE_QR_SIZE + CARD_BELOW_QR_PX;
  const bandOffset = -CARD_BOTTOM_RAISE_PX + BOTTOM_PLATE_LOWER_PX + TOP_VEIL_PX;
  const fallback = `calc(${BAND_HEIGHT_SCALE} * (${100 - CARD_BOTTOM_TARGET_LVH}lvh - ${bandOffset}px))`;
  // The band keeps its height. The card ends on the band, so nothing white sits between them.
  return `calc(100svh - var(--vv-bottom, 0px) - var(--band-h, ${fallback}) - env(safe-area-inset-top) - ${stackTopBelowSafe}px)`;
}

export function libraryStackTopPx(safeTop: number) {
  return safeTop + QR_GAP_SYMMETRIC_PX + QR_SIZE - QR_OVERLAP_LIBRARY_PX + LIBRARY_WHITE_TOP_DROP_PX;
}

export function libraryStackHeightPx(viewportH: number, safeTop: number) {
  return viewportH - libraryStackTopPx(safeTop);
}

export function libraryCardHeightPx(viewportH: number, safeTop: number) {
  const stackHeight = viewportH - (libraryStackTopPx(safeTop) - LIBRARY_WHITE_TOP_DROP_PX);
  return Math.round((stackHeight - LIBRARY_QR_OVERLAP_EXTRA_PX) * LIBRARY_CARD_SHARE) - LIBRARY_WHITE_TOP_DROP_PX;
}

export function librarySheetTopPx(viewportH: number, safeTop: number) {
  return libraryStackTopPx(safeTop) + libraryCardHeightPx(viewportH, safeTop);
}
