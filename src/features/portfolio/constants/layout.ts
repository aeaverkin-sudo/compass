/** Pixel layout from the approved main / library mockups. All Y values are below the safe area. */

export const SHARE_TOP = 16;
export const SHARE_SIZE = 19;
export const SHARE_TO_QR = 14;

export const QR_TOP = SHARE_TOP + SHARE_SIZE + SHARE_TO_QR;
export const QR_SIZE = 168;
export const GAP_UNDER_QR = 18;
export const QR_OVERLAP = 112;

export const CARD_TOP_BROWSE = QR_TOP + QR_SIZE + GAP_UNDER_QR;
export const CARD_TOP_LIBRARY = QR_TOP + QR_SIZE - QR_OVERLAP;

export const CARD_MARGIN = {
  browse: { left: 10, right: 22 },
  library: { left: 20, right: 20 },
} as const;

export const LIBRARY_MARGIN = {
  browse: { left: 20, right: 20, bottom: 18, overlap: 22 },
  library: { left: 14, right: 14, bottom: 14, gap: 10 },
} as const;

export function safeTop(px: number) {
  return `calc(env(safe-area-inset-top) + ${px}px)`;
}

export function safeBottom(px: number) {
  return `calc(env(safe-area-inset-bottom) + ${px}px)`;
}
