const TOKEN = /^[A-Za-z0-9_-]{21}$/;
const CODE = /^[А-Я0-9]{4,6}$/;

export function isEventLookup(value: string): boolean {
  return TOKEN.test(value) || CODE.test(value);
}

/** After sign-in, only this path may come back to an invite. */
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
