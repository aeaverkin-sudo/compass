const SLUG_MAX = 64;
const STEM_MAX = 60;

function kept(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 48 && cp <= 57) ||
    (cp >= 97 && cp <= 122) ||
    (cp >= 192 && cp <= 687) ||
    (cp >= 1024 && cp <= 1327)
  );
}

/** Readable address from the event name. Empty when the name has no letters or digits. */
export function eventNameSlug(name: string): string | null {
  const lowered = name.trim().toLowerCase();
  let out = "";
  let prevHyphen = false;
  for (const ch of lowered) {
    if (/\s/u.test(ch) || ch === "_" || ch === "-") {
      if (out && !prevHyphen && out.length < STEM_MAX) {
        out += "-";
        prevHyphen = true;
      }
      continue;
    }
    if (!kept(ch) || out.length >= STEM_MAX) continue;
    out += ch;
    prevHyphen = false;
  }
  out = out.replace(/-+$/g, "");
  return out || null;
}

/** First event keeps the name. The next one with the same name gets `-2`, then `-3`. */
export function indexedEventSlug(stem: string, index: number): string {
  if (index <= 1) return stem;
  const suffix = `-${index}`;
  const cut = stem.slice(0, Math.max(1, SLUG_MAX - suffix.length)).replace(/-+$/g, "");
  return `${cut}${suffix}`;
}

export function eventPublicPath(key: string): string {
  return `/e/${key}`;
}
