/** Terms and Privacy are accepted together, so they share one stored version. */
export const TERMS_VERSION = "1.0";
export const PRIVACY_VERSION = "1.0";

/** Bump this when the legal text changes. A new version asks for consent again. */
export const CONSENT_VERSION = TERMS_VERSION;

export const CONSENT_ACCEPTED_EVENT = "compass-consent-accepted";

export type ConsentPath = "trial" | "register";
