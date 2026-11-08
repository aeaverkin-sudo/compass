const EVENT_WORK_KEY = "aded-event-work";

function pathnameOf(path: string) {
  return path.split("?")[0]?.split("#")[0] ?? path;
}

/** Event list, Create event, and the cabinet. Not contacts, Data, or the public poster. */
export function isEventWorkPath(path: string) {
  const pathname = pathnameOf(path);
  if (pathname === "/network/event") return true;
  return /^\/e\/[^/]+\/manage(?:\/|$)/.test(pathname);
}

/** The work page to open again after a trip away. The list's back arrow clears it. */
export function rememberEventWorkPlace(path: string) {
  const pathname = pathnameOf(path);
  if (!isEventWorkPath(pathname)) return;
  try {
    sessionStorage.setItem(EVENT_WORK_KEY, pathname);
  } catch {
    // Private mode. The open page still stays where it is.
  }
}

export function readEventWorkPlace() {
  try {
    const value = sessionStorage.getItem(EVENT_WORK_KEY);
    return value && isEventWorkPath(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearEventWorkPlace() {
  try {
    sessionStorage.removeItem(EVENT_WORK_KEY);
  } catch {
    // Private mode.
  }
}
