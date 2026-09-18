/** Pixel layout from approved main / library mockups. Y offsets are below safe-area top. */

export const QR_SIZE = 168;

/** Share row reserves space above QR (button not built yet). */
export const QR_TOP_OFFSET = 49;

export const GAP_UNDER_QR = 18;
export const QR_OVERLAP_LIBRARY_PX = 112;

export const CARD_TOP_BROWSE_OFFSET = QR_TOP_OFFSET + QR_SIZE + GAP_UNDER_QR;
export const CARD_TOP_LIBRARY_OFFSET = QR_TOP_OFFSET + QR_SIZE - QR_OVERLAP_LIBRARY_PX;

export const SHEET_INSET = {
  browse: { horizontal: 20, bottom: 18, overlap: 22 },
  library: { horizontal: 14, bottom: 14, gap: 10 },
} as const;

export const LAYER_TRANSITION_MS = 460;

export type MainScreenMode = "browse" | "library";
