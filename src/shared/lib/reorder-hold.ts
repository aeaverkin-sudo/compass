/** Hold on the owner card before arrange mode turns on. */
export const ARRANGE_HOLD_MS = 350;

/** Hold on the QR rail before it can be moved between docks. */
export const RAIL_HOLD_MS = 500;

/** Hold on an edit row before it can be deleted from the library. */
export const DELETE_HOLD_MS = 900;

/** + or − needs a hold this long, so a stray touch does not add or remove a row. */
export const ROW_TOGGLE_HOLD_MS = 220;

/** A tap on + or − shows on the row this long before the row moves. */
export const ROW_TOGGLE_MS = 350;

/** A move this large before the hold finishes is a scroll, not a drag. */
export const REORDER_SLOP_PX = 8;
