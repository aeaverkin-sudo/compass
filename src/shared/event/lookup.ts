const TOKEN = /^[A-Za-z0-9_-]{21}$/;
const CODE = /^[А-Я0-9]{4,6}$/;

export function isEventLookup(value: string): boolean {
  return TOKEN.test(value) || CODE.test(value);
}

/** After sign-in, a guest may come back to join. */
export function isEventJoinPath(path: string): boolean {
  if (!path.startsWith("/e/") || path.includes("//") || path.includes("\\") || path.includes("?") || path.includes("#")) {
    return false;
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "e" || parts[2] !== "join") return false;
  let lookup = parts[1] ?? "";
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    return false;
  }
  return isEventLookup(lookup);
}

/** After sign-in, an invited manager may come back to accept. */
export function isEventTeamPath(path: string): boolean {
  if (!path.startsWith("/e/") || path.includes("//") || path.includes("\\") || path.includes("?") || path.includes("#")) {
    return false;
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 4 || parts[0] !== "e" || parts[2] !== "team") return false;
  let lookup = parts[1] ?? "";
  let token = parts[3] ?? "";
  try {
    lookup = decodeURIComponent(lookup);
    token = decodeURIComponent(token);
  } catch {
    return false;
  }
  return isEventLookup(lookup) && TOKEN.test(token);
}
