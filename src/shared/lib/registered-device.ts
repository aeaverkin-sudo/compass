const KEY = "compass-registered-device";

/** This browser once held a registered session. Survives a lost cookie. */
export function markRegisteredDevice() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Private mode can block storage. The session cookie still stands.
  }
}

export function deviceWasRegistered() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
