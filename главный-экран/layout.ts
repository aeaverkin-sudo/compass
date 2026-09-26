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
/** Extra 0.5mm between the QR and the rule, and between the rule and the photo. */
export const RULE_GAP_PX = QR_GAP_SYMMETRIC_PX + 96 / 25.4 / 2;
/** Browse QR, grown into the existing slot so it sits higher. The card does not move. */
export const BROWSE_QR_SIZE = 150;
/** Slot from the safe area to the rule: 18 + 134 + 18. */
export const HEADER_SLOT_PX = QR_GAP_SYMMETRIC_PX + QR_SIZE + QR_GAP_SYMMETRIC_PX;
/** Equal gap: island → QR, QR → rule, rule → photo. */
export const HEADER_RHYTHM_PX = (HEADER_SLOT_PX - BROWSE_QR_SIZE) / 2;

/**
 * White shared by three edges, measured where the picture is gone:
 * the rule to the photo, the photo to the position glyphs, and the
 * bottom veil's solid white (the card edge) to the dots.
 */
export const ZONE_GAP_PX = RULE_GAP_PX;

/** Browse page dots, outer edge to outer edge. */
export const BROWSE_DOT_PX = 9.2;

/** Zone 3 is twice the shared gap, then 1mm lower. */
export const ZONE3_LOWER_PX = 96 / 25.4;
export const ZONE3_PX = ZONE_GAP_PX * 2 - ZONE3_LOWER_PX;

/** From the veil's solid edge down to the top of the dots. */
export const ZONE4_PX = ZONE_GAP_PX;

/** Card edge to the bottom of the screen: zone 4, the dots, zone 3. */
export const CARD_BOTTOM_GAP_PX = ZONE4_PX + BROWSE_DOT_PX + ZONE3_PX;

/**
 * Helvetica Neue 15.5px / 1.45: line-box top to the glyph top.
 * Photo edge to that glyph top is ZONE_GAP_PX.
 */
export const SECTION_INK_INSET_PX = 5.67;
export const HERO_TO_SECTION_PX = ZONE_GAP_PX - SECTION_INK_INSET_PX;

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
  return safeTop + HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX;
}

export function browseCardHeightPx(viewportH: number, safeTop: number) {
  return Math.round(viewportH - CARD_BOTTOM_GAP_PX - browseStackTopPx(safeTop));
}

export function browseCardHeight() {
  const stackTopBelowSafe = HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX;
  return `calc(100lvh - env(safe-area-inset-top) - ${stackTopBelowSafe}px - ${CARD_BOTTOM_GAP_PX}px)`;
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
