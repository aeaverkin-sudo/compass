const TOKEN = /^[A-Za-z0-9_-]{21}$/;
const CODE = /^(?:[А-Я0-9]{4,6}|[A-HJ-NP-Z2-9]{4,6})$/;
const NAME = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;

export function isEventLookup(value: string): boolean {
  if (value.length < 1 || value.length > 80) return false;
  return TOKEN.test(value) || CODE.test(value) || NAME.test(value);
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

/** After sign-in, an invited manager may come back to accept. `accept=1` is the only query this path may carry. */
export function isEventTeamPath(path: string): boolean {
  if (!path.startsWith("/e/") || path.includes("//") || path.includes("\\") || path.includes("#")) {
    return false;
  }
  const cut = path.indexOf("?");
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const search = cut === -1 ? "" : path.slice(cut + 1);
  if (search !== "" && search !== "accept=1") return false;
  const parts = pathname.split("/").filter(Boolean);
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
