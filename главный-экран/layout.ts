/** Pixel layout from approved main / library mockups. */

export const QR_SIZE = 168;

/** QR sits 0.5 cm below safe-area top (share row not built yet). */
export const QR_TOP_MARGIN_CM = 0.5;

export const GAP_UNDER_QR = 18;
export const QR_OVERLAP_LIBRARY_PX = 112;

export const SHEET_INSET = {
  browse: { horizontal: 14, bottom: 18, overlap: 22 },
  library: { horizontal: 14, bottom: 14, gap: 10 },
} as const;

/** Browse peek: sheet body ≈ 42% of viewport (from mockup). */
export const SHEET_PEEK_LVH = 42;

export const LAYER_TRANSITION_MS = 460;

export type MainScreenMode = "browse" | "library";
