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

/** A hung sheet must not block the next tap. Two seconds, then the flag drops. Not counted as sent. */
const SHARE_WAIT_MS = 2000;
const SHARE_NOTICE = "compass-share-notice";

let shareBusy = false;

export function shareInFlight() {
  return shareBusy;
}

export function showShareNotice(text: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHARE_NOTICE, { detail: text }));
}

export function onShareNotice(listener: (text: string) => void) {
  if (typeof window === "undefined") return () => undefined;
  const onNotice = (event: Event) => {
    const text = (event as CustomEvent<string>).detail;
    if (text) listener(text);
  };
  window.addEventListener(SHARE_NOTICE, onNotice);
  return () => window.removeEventListener(SHARE_NOTICE, onNotice);
}

export type SheetShare = { sent: boolean; errorName?: string };

/**
 * One system share at a time. A second tap while this is open is ignored.
 * The call itself is synchronous, so it stays inside the tap.
 */
export function presentShare(data: ShareData, copyUrl?: string): Promise<SheetShare> {
  if (shareBusy || typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return Promise.resolve({ sent: false });
  }
  shareBusy = true;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    shareBusy = false;
    endCardShare();
  };
  let sharePromise: Promise<void>;
  try {
    sharePromise = navigator.share(data);
  } catch (error: unknown) {
    shareBusy = false;
    const name = error instanceof DOMException ? error.name : "Error";
    showShareNotice(name);
    return Promise.resolve({ sent: false, errorName: name });
  }
  beginCardShare();
  const outcome = sharePromise.then(
    () => ({ sent: true as const, errorName: undefined }),
    (error: unknown) => ({
      sent: false as const,
      errorName: error instanceof DOMException ? error.name : "Error",
    }),
  );
  const timeout = new Promise<SheetShare>((resolve) => {
    window.setTimeout(() => resolve({ sent: false, errorName: "timeout" }), SHARE_WAIT_MS);
  });
  return Promise.race([outcome, timeout]).then(async (result) => {
    close();
    if (result.sent) return { sent: true };
    const name = result.errorName ?? "Error";
    if (name === "timeout") return { sent: false, errorName: name };
    if (name === "AbortError" || !copyUrl) {
      showShareNotice(name);
      return { sent: false, errorName: name };
    }
    const copied = await copyText(copyUrl);
    showShareNotice(copied ? `${name}. Link copied.` : name);
    return { sent: false, errorName: name };
  });
}

function copyText(url: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return Promise.resolve(false);
  return navigator.clipboard.writeText(url).then(
    () => true,
    () => false,
  );
}
