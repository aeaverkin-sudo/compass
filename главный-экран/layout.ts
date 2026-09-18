/** Layout offsets from the physical screen top (viewport-fit: cover). */

export const QR_SIZE = 168;

/** Browse card photo — 70% of QR size, ~0.5 cm below card top edge. */
export const CARD_PHOTO_SIZE_PX = 118;
export const CARD_PHOTO_TOP_PX = 19;
export const CARD_PHOTO_RADIUS_PX = 13;

/** Browse card name — half previous size, ~0.2 cm below photo. */
export const CARD_NAME_SIZE_PX = 22;
export const CARD_NAME_GAP_PX = 8;

/** Equal gap: safe-area bottom → QR top, and QR bottom → card top. */
export const QR_GAP_SYMMETRIC_PX = 18;

/** Browse card bottom ≈ this % of viewport (green mockup outline). */
export const CARD_BOTTOM_TARGET_LVH = 73;

/** Trim browse card bottom edge (px; negative extends downward). −19 ≈ +0.5 cm. */
export const CARD_BOTTOM_RAISE_PX = -19;

export const QR_OVERLAP_LIBRARY_PX = 112;

export const SHEET_INSET = {
  browse: { horizontal: 14, bottom: 18, overlap: 22 },
  library: { horizontal: 14, bottom: 14, gap: 10 },
} as const;

export const LAYER_TRANSITION_MS = 460;

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
  const stackBelowSafe = QR_GAP_SYMMETRIC_PX + QR_SIZE + QR_GAP_SYMMETRIC_PX - CARD_BOTTOM_RAISE_PX;
  return `calc(${CARD_BOTTOM_TARGET_LVH}lvh - env(safe-area-inset-top) - ${stackBelowSafe}px)`;
}
