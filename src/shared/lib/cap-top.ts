const cache = new Map<string, { cap: number; baseline: number }>();

/** Space above the cap inside the line box, before fonts can be measured. */
export function capTopEstimate(sizePx: number, lineHeightPx: number) {
  const ratio = sizePx > 0 ? lineHeightPx / sizePx : 1;
  return ((ratio - 1) * sizePx) / 2 + 0.08 * sizePx;
}

function readLine(el: Element): { size: number; lineHeight: number; key: string } | null {
  const style = getComputedStyle(el);
  const size = Number.parseFloat(style.fontSize);
  if (!Number.isFinite(size) || size <= 0) return null;
  const parsedLine = Number.parseFloat(style.lineHeight);
  const lineHeight = Number.isFinite(parsedLine) ? parsedLine : size;
  const key = `${size}|${lineHeight}|${style.fontWeight}|${style.fontFamily}`;
  return { size, lineHeight, key };
}

function metricsFor(el: Element): { cap: number; baseline: number } | null {
  const line = readLine(el);
  if (!line) return null;
  const cached = cache.get(line.key);
  if (cached) return cached;

  const style = getComputedStyle(el);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = `${style.fontWeight} ${line.size}px ${style.fontFamily}`;
  const measured = context.measureText("H");
  const ascent = measured.fontBoundingBoxAscent;
  const descent = measured.fontBoundingBoxDescent;
  const cap = measured.actualBoundingBoxAscent;
  if (![ascent, descent, cap].every((value) => Number.isFinite(value))) return null;
  const halfLeading = (line.lineHeight - (ascent + descent)) / 2;
  const metrics = { cap: halfLeading + (ascent - cap), baseline: halfLeading + ascent };
  cache.set(line.key, metrics);
  return metrics;
}

/** Pull a line up by this much and its capital top sits on the box top. */
export function capTop(el: Element): number {
  const line = readLine(el);
  if (!line) return 0;
  return metricsFor(el)?.cap ?? capTopEstimate(line.size, line.lineHeight);
}

/** Distance from the top of the line box to the alphabetic baseline. */
export function baselineOffset(el: Element): number {
  const line = readLine(el);
  if (!line) return 0;
  const metrics = metricsFor(el);
  if (!metrics) return (line.lineHeight - line.size) / 2 + line.size * 0.8;
  return metrics.baseline;
}
