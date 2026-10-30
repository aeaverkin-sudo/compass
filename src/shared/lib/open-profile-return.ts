const KEY = "aded-open-profile";

/** This tab just created a portfolio from this open link and opened it. */
export function rememberOpenProfile(lookup: string): void {
  const value = lookup.trim();
  if (!value) return;
  try {
    sessionStorage.setItem(KEY, value);
  } catch {
    // A private tab can refuse the write. I'm going then stays on the event page.
  }
}

/** The same tab came back to this open link after that portfolio. */
export function openProfileThisSession(lookup: string): boolean {
  const value = lookup.trim();
  if (!value) return false;
  try {
    return sessionStorage.getItem(KEY) === value;
  } catch {
    return false;
  }
}
