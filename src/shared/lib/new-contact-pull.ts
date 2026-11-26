/** One finger pulling the first card. No DOM, no scrolling. */

export type ContactPull = {
  armed: boolean;
  holding: boolean;
  fired: boolean;
};

export type ContactPullStart = {
  index: number;
  editing: boolean;
  arranging: boolean;
  focused: boolean;
  guest: boolean;
  addSlide: boolean;
  browsing: boolean;
  /** clientX where the finger landed. */
  edgeX: number;
  /** Button, field, or data-no-swipe. */
  onControl: boolean;
};

export type ContactPullMove = {
  dx: number;
  dy: number;
  heldMs: number;
  index: number;
  editing: boolean;
  arranging: boolean;
  focused: boolean;
};

const idle = (): ContactPull => ({ armed: false, holding: false, fired: false });

export function beginContactPull(start: ContactPullStart, edgePx: number): ContactPull {
  const blocked =
    !start.browsing ||
    start.index !== 0 ||
    start.editing ||
    start.arranging ||
    start.focused ||
    start.guest ||
    start.addSlide ||
    start.edgeX < edgePx ||
    start.onControl;
  if (blocked) return idle();
  return { armed: true, holding: false, fired: false };
}

/** Keep watching. A pull that no longer qualifies drops the hold but stays armed. */
export function continueContactPull(
  pull: ContactPull,
  move: ContactPullMove,
  pullPx: number,
  holdMs: number,
): ContactPull {
  if (!pull.armed) return idle();
  if (pull.fired) return pull;
  const blocked = move.index !== 0 || move.editing || move.arranging || move.focused;
  const qualified = move.dx >= pullPx && move.dx > Math.abs(move.dy);
  if (blocked || !qualified) return { armed: true, holding: false, fired: false };
  if (move.heldMs >= holdMs) return { armed: true, holding: true, fired: true };
  return { armed: true, holding: true, fired: false };
}

export function resetContactPull(): ContactPull {
  return idle();
}

export function contactPullFires(pull: ContactPull): boolean {
  return pull.fired;
}
