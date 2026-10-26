/** While the system share sheet is up, leaving the app must not jump to another card. */
let sharing = false;
let holdCardUntil = 0;
let editBlockedUntil = 0;

const AFTER_MS = 800;

export function beginCardShare() {
  sharing = true;
  holdCardUntil = Number.POSITIVE_INFINITY;
}

export function endCardShare() {
  sharing = false;
  const until = Date.now() + AFTER_MS;
  holdCardUntil = until;
  editBlockedUntil = until;
}

/** The card on screen stays put: the sheet is open, or it just closed. */
export function cardShareHoldsPlace() {
  return sharing || Date.now() < holdCardUntil;
}

export function blockEditBriefly() {
  editBlockedUntil = Date.now() + AFTER_MS;
}

/** A tap that arrives as the app or the share sheet comes back is not Edit. */
export function editTapBlocked() {
  return Date.now() < editBlockedUntil;
}
