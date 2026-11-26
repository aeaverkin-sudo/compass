/** The photo plus box. Same 23px frame as the toolbar plus. */
export const PLUS_PX = 23;

/** How far the plus moves right so its centre meets the centre of "01". */
export function plusShiftPx(digitWidth: number): number {
  if (!Number.isFinite(digitWidth) || digitWidth <= 0) return 0;
  return (digitWidth - PLUS_PX) / 2;
}
