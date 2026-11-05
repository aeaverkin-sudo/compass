const KEY = "compass-registered-device";
const EMAIL_KEY = "compass-account-email";

/** This browser once held a registered session. Survives a lost cookie. */
export function markRegisteredDevice() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Private mode can block storage. The session cookie still stands.
  }
}

export function clearRegisteredDevice() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    // Private mode can block storage.
  }
}

/** The address this browser last signed in with. Never the password. */
export function rememberAccountEmail(email: string) {
  const mail = email.trim().toLowerCase();
  if (!mail || mail.length > 254 || !mail.includes("@")) return;
  try {
    localStorage.setItem(EMAIL_KEY, mail);
  } catch {
    // Private mode can block storage.
  }
}

export function rememberedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY)?.trim().toLowerCase() ?? "";
  } catch {
    return "";
  }
}

/** The existing Sign in screen. The only addition is the stored address. */
export function signInPath(options?: { expired?: boolean; next?: string }) {
  const query = new URLSearchParams();
  query.set("signin", "1");
  const email = rememberedEmail();
  if (email) query.set("email", email);
  if (options?.expired) query.set("expired", "1");
  if (options?.next) query.set("next", options.next);
  return `/register?${query.toString()}`;
}

export function deviceWasRegistered() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
