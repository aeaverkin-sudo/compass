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
/** t-label line of the sheet counter plus its mb-1. It sits between the QR and the photo. */
const SHEET_MARK_BLOCK_PX = 11 * 1.45 + 4;
/** Bottom of the QR to the top edge of the photo. */
const QR_TO_PHOTO_PX = RULE_GAP_PX + SHEET_MARK_BLOCK_PX + RULE_GAP_PX;
/** Lower the QR by one quarter of that gap. The card stays. */
export const QR_DROP_PX = QR_TO_PHOTO_PX / 4;
/** Browse QR, grown into the existing slot so it sits higher. The card does not move. */
export const BROWSE_QR_SIZE = 150;
/** Slot from the safe area to the rule: 18 + 134 + 18. */
export const HEADER_SLOT_PX = QR_GAP_SYMMETRIC_PX + QR_SIZE + QR_GAP_SYMMETRIC_PX;
/** Equal gap: island → QR, QR → rule, rule → photo. */
export const HEADER_RHYTHM_PX = (HEADER_SLOT_PX - BROWSE_QR_SIZE) / 2;
/** Top edge of the QR, below the safe area. Screen headers share this axis. */
export const SCREEN_TOP_AXIS_PX = HEADER_RHYTHM_PX + QR_DROP_PX;

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
export const BAND_HEIGHT_SCALE = 0.55;

/** Pixels trimmed off the band so the card, the plate and the veil share one edge. */
export function bandHeightOffsetPx() {
  return -CARD_BOTTOM_RAISE_PX + BOTTOM_PLATE_LOWER_PX + TOP_VEIL_PX;
}

/**
 * Declared band height from the stable full screen (`lvh`), not the visible remainder.
 * Same number on one phone in the home-screen app, Safari and Chrome.
 */
export function browseBandHeightPx(fullH: number) {
  const share = (100 - CARD_BOTTOM_TARGET_LVH) / 100;
  return BAND_HEIGHT_SCALE * (fullH * share - bandHeightOffsetPx());
}

/** Same height as `browseBandHeightPx`, for the plaque before the layout hook measures the screen. */
export function browseBandHeightCss() {
  const offset = bandHeightOffsetPx();
  return `calc(${BAND_HEIGHT_SCALE} * (${100 - CARD_BOTTOM_TARGET_LVH}lvh - ${offset}px))`;
}

export function browseCardHeight() {
  const stackTopBelowSafe = HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX;
  const fallback = browseBandHeightCss();
  // The band keeps its height. The card ends on the band, so nothing white sits between them.
  // `--app-h` is the measured small viewport, set before the first paint.
  return `calc(var(--app-h, 100svh) - var(--vv-bottom, 0px) - var(--band-h, ${fallback}) - env(safe-area-inset-top) - ${stackTopBelowSafe}px)`;
}

/**
 * Blocking head script. Same probes and the same band formula as the layout hook,
 * so the first paint is already the measured size.
 */
export function screenMeasureScript() {
  const share = (100 - CARD_BOTTOM_TARGET_LVH) / 100;
  const offset = bandHeightOffsetPx();
  return `(function(){
var root=document.documentElement;
function probe(unit){
  var el=document.createElement("div");
  el.style.cssText="position:fixed;top:0;height:100"+unit+";visibility:hidden;pointer-events:none";
  root.appendChild(el);
  var h=el.getBoundingClientRect().height;
  el.remove();
  return h||window.innerHeight;
}
var full=probe("lvh");
var visible=probe("svh");
var band=Math.max(0,Math.round(${BAND_HEIGHT_SCALE}*(full*${share}-${offset})));
var vv=window.visualViewport;
var lift=0;
if(vv){
  var gap=Math.round(visible-vv.height);
  if(gap>0&&gap<120)lift=gap;
}
root.style.setProperty("--app-h",Math.round(visible)+"px");
root.style.setProperty("--band-h",band+"px");
root.style.setProperty("--vv-bottom",lift+"px");
root.classList.add("compass-sized");
})();`;
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
