/** Layout offsets from the physical screen top (viewport-fit: cover). */

export const QR_SIZE = 168;

export const QR_TOP_OFFSET_PX = 0;
export const GAP_UNDER_QR = 18;

/** Browse card bottom ≈ this % of viewport (green mockup outline). */
export const CARD_BOTTOM_TARGET_LVH = 73;

/** Trim browse card bottom edge upward (~1 cm @ 96 dpi). */
export const CARD_BOTTOM_RAISE_PX = 38;

export const QR_OVERLAP_LIBRARY_PX = 112;

export const CARD_TOP_BROWSE_OFFSET_PX = QR_TOP_OFFSET_PX + QR_SIZE + GAP_UNDER_QR;
export const CARD_TOP_LIBRARY_OFFSET_PX = QR_TOP_OFFSET_PX + QR_SIZE - QR_OVERLAP_LIBRARY_PX;

export const SHEET_INSET = {
  browse: { horizontal: 14, bottom: 18, overlap: 22 },
  library: { horizontal: 14, bottom: 14, gap: 10 },
} as const;

export const LAYER_TRANSITION_MS = 460;

export type MainScreenMode = "browse" | "library";

export function layoutTop(offsetPx: number) {
  return `${offsetPx}px`;
}

export function browseCardMinHeight() {
  return `calc(${CARD_BOTTOM_TARGET_LVH}lvh - ${CARD_TOP_BROWSE_OFFSET_PX}px - ${CARD_BOTTOM_RAISE_PX}px)`;
}
