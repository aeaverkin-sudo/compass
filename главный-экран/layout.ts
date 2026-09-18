/** Main screen proportions — sheet peek is larger than the card body. */

export const QR_ZONE_LVH = 18;
export const SHEET_PEEK_LVH = 32;
export const SHEET_OVERLAP_PX = 24;
export const HORIZONTAL_INSET_PX = 20;

export function sheetPeekHeight() {
  return `calc(${SHEET_PEEK_LVH}lvh + env(safe-area-inset-bottom))`;
}

export function cardBottomOffset() {
  return `calc(${SHEET_PEEK_LVH}lvh - ${SHEET_OVERLAP_PX}px + env(safe-area-inset-bottom))`;
}
