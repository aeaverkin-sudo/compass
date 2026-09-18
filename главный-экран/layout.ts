/** Layout offsets below env(safe-area-inset-top). */

export const QR_SIZE = 168;

/** QR starts immediately below safe-area top. */
export const QR_TOP_OFFSET_PX = 0;

export const GAP_UNDER_QR = 18;

/** Extra browse card height below content (sheet follows card bottom). */
export const CARD_BOTTOM_EXTENSION_CM = 1.5;

export const QR_OVERLAP_LIBRARY_PX = 112;

export const CARD_TOP_BROWSE_OFFSET_PX = QR_TOP_OFFSET_PX + QR_SIZE + GAP_UNDER_QR;
export const CARD_TOP_LIBRARY_OFFSET_PX = QR_TOP_OFFSET_PX + QR_SIZE - QR_OVERLAP_LIBRARY_PX;

export const SHEET_INSET = {
  browse: { horizontal: 14, bottom: 18, overlap: 22 },
  library: { horizontal: 14, bottom: 14, gap: 10 },
} as const;

/** Browse peek: sheet body ≈ 42% of viewport (from mockup). */
export const SHEET_PEEK_LVH = 42;

export const LAYER_TRANSITION_MS = 460;

export type MainScreenMode = "browse" | "library";

/** Position below the iOS safe-area inset. */
export function safeTop(offsetPx: number) {
  return `calc(env(safe-area-inset-top) + ${offsetPx}px)`;
}
