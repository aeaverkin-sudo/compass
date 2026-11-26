/** Terms and Privacy are accepted together, so they share one stored version. */
export const TERMS_VERSION = "1.6";
export const PRIVACY_VERSION = "1.7";

/** Bump this when the legal text changes. A new version asks for consent again. */
export const CONSENT_VERSION = TERMS_VERSION;

/** A stored acceptance is older only when every part parses and one is behind the current text. */
export function isOlderConsent(stored: string | null, current: string) {
  if (!stored) return false;
  const left = stored.split(".").map((part) => Number(part));
  const right = current.split(".").map((part) => Number(part));
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const earlier = left[index] ?? 0;
    const later = right[index] ?? 0;
    if (!Number.isFinite(earlier) || !Number.isFinite(later)) return false;
    if (earlier < later) return true;
    if (earlier > later) return false;
  }
  return false;
}

export const CONSENT_ACCEPTED_EVENT = "compass-consent-accepted";

/** `mail`: the I'm going button in the invitation mail, which carries the same footnote. */
export type ConsentPath = "trial" | "register" | "event" | "mail";

export type EventConsentPath = Extract<ConsentPath, "event" | "mail">;
