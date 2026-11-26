/** The photo plus box. MarkPlus without a size is 20px. */
export const PLUS_PX = 20;

/** How far the plus moves right so its centre meets the centre of "01". */
export function plusShiftPx(digitWidth: number): number {
  if (!Number.isFinite(digitWidth) || digitWidth <= 0) return 0;
  return (digitWidth - PLUS_PX) / 2;
}
