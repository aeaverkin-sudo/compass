/** Layout offsets from the physical screen top (viewport-fit: cover). */

/** ~10% under 168 so the card picks up the freed space. */
export const QR_SIZE = 134;
/** Dark apelsin orange — vivid but enough contrast on white for phone scanners. */
export const QR_COLOR = "#E8640C";

/** Browse card photo — 70% of QR size, ~0.5 cm below card top edge. */
export const CARD_PHOTO_SIZE_PX = 118;
export const CARD_PHOTO_TOP_PX = 19;

/** Card name — 21px, weight 500. */
export const CARD_HEADER_NAME_SIZE_PX = 21;

/** Library stack gap. */
const QR_GAP_SYMMETRIC_PX = 18;
/** Extra 0.5mm between the QR and the rule, and between the rule and the photo. */
export const RULE_GAP_PX = QR_GAP_SYMMETRIC_PX + 96 / 25.4 / 2;
/** Pull the photo and the text under it up inside the card. The card box stays. */
export const CARD_TOP_TRIM_PX = 9;
/** Ритм A между QR и фото; исторически — строка счётчика. */
const SHEET_MARK_BLOCK_PX = 11 * 1.45 + 4;
/** Bottom of the QR to the top edge of the photo. */
const QR_TO_PHOTO_PX = RULE_GAP_PX + SHEET_MARK_BLOCK_PX + RULE_GAP_PX;
/** Lower the QR by one quarter of that gap. The card stays. */
const QR_DROP_PX = QR_TO_PHOTO_PX / 4;
/** Last section to the sky plaque on the owner card: the same gap as the QR to the photo. */
export const CARD_FOOTER_GAP_PX = QR_TO_PHOTO_PX - QR_DROP_PX - CARD_TOP_TRIM_PX;
/** Last millimetre of the plate, painted as a mask on the scroll. */
export const HEADER_FADE_PX = 6.4;
/** Hero plate below the photo. The mask adds the rest of A. */
export const CARD_HEADER_PAD_PX = QR_TO_PHOTO_PX - QR_DROP_PX - CARD_TOP_TRIM_PX - HEADER_FADE_PX;
/** py-[18px] of every section. */
export const SECTION_PAD_PX = 18;
/** Browse QR, grown into the existing slot so it sits higher. The card does not move. */
export const BROWSE_QR_SIZE = 150;
/** Hero photo on the browse card. The rail can dock to this height. */
export const HERO_PHOTO_PX = 128;
/** Same photo top from the QR top, when the card top is not at hand. */
export function railPhotoTopFromQrTop(qrTop: number, scale = 1) {
  return qrTop + (BROWSE_QR_SIZE + 2 * RULE_GAP_PX - QR_DROP_PX - CARD_TOP_TRIM_PX) * scale;
}

/**
 * A short screen (Safari with its bars) is compact: the QR, the photo, the name and the gaps
 * between them shrink by this factor, and the card body takes the freed height.
 * 150 × 0.88 = 132px, still read by phone scanners.
 */
export const COMPACT_HEADER_SCALE = 0.88;
/** Visible screen height below which the header is compact. */
export const COMPACT_BELOW_PX = 700;

export function headerScaleFor(visibleH: number) {
  return visibleH < COMPACT_BELOW_PX ? COMPACT_HEADER_SCALE : 1;
}

/** The header scale already written on :root. */
export function readHeaderScale() {
  if (typeof document === "undefined") return 1;
  return document.documentElement.dataset.density === "compact" ? COMPACT_HEADER_SCALE : 1;
}
/** Slot from the safe area to the rule: 18 + 134 + 18. */
const HEADER_SLOT_PX = QR_GAP_SYMMETRIC_PX + QR_SIZE + QR_GAP_SYMMETRIC_PX;
/** Equal gap: island → QR, QR → rule, rule → photo. */
export const HEADER_RHYTHM_PX = (HEADER_SLOT_PX - BROWSE_QR_SIZE) / 2;
/** Top edge of the QR, below the safe area. Screen headers share this axis. */
export const SCREEN_TOP_AXIS_PX = HEADER_RHYTHM_PX + QR_DROP_PX;

/** The sky row. The home indicator sits in the padding under it, not in this number. */
export const BAND_ROW_PX = 48;

/** Base overlap of the library preview onto the QR zone. */
const QR_OVERLAP_LIBRARY_BASE_PX = 112;

/** ~0.5 cm — preview rises and covers the QR more; fill panel gains the same height. */
const LIBRARY_QR_OVERLAP_EXTRA_PX = 19;

const QR_OVERLAP_LIBRARY_PX =
  QR_OVERLAP_LIBRARY_BASE_PX + LIBRARY_QR_OVERLAP_EXTRA_PX;

/** Library white top sits lower so the QR shows; 0.5 cm less than the first drop. */
const LIBRARY_WHITE_TOP_DROP_PX = 29;
/** Fade from the new white edge down to the top of the name — one line higher. */
export const LIBRARY_NAME_FADE_PX = 11;

/** Library split below QR overlap — card ~50%, content sheet ~50%. */
const LIBRARY_CARD_SHARE = 0.5;

export const SHEET_INSET = {
  browse: { horizontal: 14, bottom: 18, overlap: 22 },
  library: { horizontal: 14, bottom: 0, gap: 8 },
} as const;

/** Visible tail of the next card in browse carousel (keep small — max card size). */
const CARD_CAROUSEL_PEEK_PX = 24;
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

/** Compact header on a short window. Does not size the page. */
export function writeHeaderScale() {
  const root = document.documentElement;
  const visible = Math.round(root.clientHeight || window.innerHeight);
  const scale = headerScaleFor(visible);
  root.style.setProperty("--hd", String(scale));
  root.dataset.density = scale < 1 ? "compact" : "comfortable";
  root.classList.add("compass-sized");
  return { visible, scale };
}

/** The card fills the column above the bar. The page sets that column's top and bottom. */
export function browseCardHeight() {
  return "100%";
}

/** Edit uses the same column, with its top at the QR. */
export function editCardHeight() {
  return "100%";
}

export function libraryStackTopPx(safeTop: number) {
  return safeTop + QR_GAP_SYMMETRIC_PX + QR_SIZE - QR_OVERLAP_LIBRARY_PX + LIBRARY_WHITE_TOP_DROP_PX;
}

export function libraryCardHeightPx(viewportH: number, safeTop: number) {
  const stackHeight = viewportH - (libraryStackTopPx(safeTop) - LIBRARY_WHITE_TOP_DROP_PX);
  return Math.round((stackHeight - LIBRARY_QR_OVERLAP_EXTRA_PX) * LIBRARY_CARD_SHARE) - LIBRARY_WHITE_TOP_DROP_PX;
}

export function librarySheetTopPx(viewportH: number, safeTop: number) {
  return libraryStackTopPx(safeTop) + libraryCardHeightPx(viewportH, safeTop);
}
