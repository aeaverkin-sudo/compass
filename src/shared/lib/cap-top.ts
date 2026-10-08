const cache = new Map<string, number>();

/** Space above the cap inside the line box, before fonts can be measured. */
export function capTopEstimate(sizePx: number, lineHeightPx: number) {
  const ratio = sizePx > 0 ? lineHeightPx / sizePx : 1;
  return ((ratio - 1) * sizePx) / 2 + 0.08 * sizePx;
}

/**
 * Pull a line up by this much and its capital top sits on the box top.
 * Reads the element's own font. The canvas measurement is cached.
 */
export function capTop(el: Element): number {
  const style = getComputedStyle(el);
  const size = Number.parseFloat(style.fontSize);
  if (!Number.isFinite(size) || size <= 0) return 0;
  const parsedLine = Number.parseFloat(style.lineHeight);
  const lineHeight = Number.isFinite(parsedLine) ? parsedLine : size;
  const family = style.fontFamily;
  const key = `${size}|${lineHeight}|${style.fontWeight}|${family}`;
  const cached = cache.get(key);
  if (cached != null) return cached;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return capTopEstimate(size, lineHeight);
  context.font = `${style.fontWeight} ${size}px ${family}`;
  const measured = context.measureText("H");
  const ascent = measured.fontBoundingBoxAscent;
  const descent = measured.fontBoundingBoxDescent;
  const cap = measured.actualBoundingBoxAscent;
  if (![ascent, descent, cap].every((value) => Number.isFinite(value))) {
    return capTopEstimate(size, lineHeight);
  }
  const halfLeading = (lineHeight - (ascent + descent)) / 2;
  const value = halfLeading + (ascent - cap);
  cache.set(key, value);
  return value;
}
