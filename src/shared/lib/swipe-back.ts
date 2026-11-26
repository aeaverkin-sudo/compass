/** Off: a right swipe does not leave Edit or Account. */
export const SWIPE_BACK = true;

const MIN_PX = 56;
const EDGE_PX = 40;
const MAX_RAD = (30 * Math.PI) / 180;

/** One finger, from touch down to touch up. No DOM. */
export type SwipeBack = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  /** Input, button, switch, or data-no-swipe. */
  onControl: boolean;
  /** data-row-handle or data-rubric-handle. */
  onHandle: boolean;
  /** data-reordering is on screen. */
  reordering: boolean;
  keyboardOpen: boolean;
  fieldFocused: boolean;
};

/** True when this stroke is a back swipe. */
export function swipeBackFires(swipe: SwipeBack): boolean {
  if (swipe.onControl || swipe.onHandle || swipe.reordering || swipe.keyboardOpen || swipe.fieldFocused) {
    return false;
  }
  if (swipe.startX < EDGE_PX || swipe.startX > swipe.width - EDGE_PX) return false;
  const dx = swipe.endX - swipe.startX;
  const dy = swipe.endY - swipe.startY;
  if (!(dx > 0) || Math.hypot(dx, dy) < MIN_PX) return false;
  return Math.atan2(Math.abs(dy), dx) <= MAX_RAD;
}
