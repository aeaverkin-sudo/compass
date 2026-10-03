export type FittedTitle = {
  lines: string[];
  fontSize: number;
};

export type TitleMeasure = {
  width: number;
  height: number;
};

/** Every way to break words into 1–3 lines. One word stays one line. */
export function titleBreaks(text: string, maxLines = 3): string[][] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [[""]];
  const breaks: string[][] = [];
  const walk = (start: number, linesLeft: number, built: string[]) => {
    if (linesLeft === 1) {
      breaks.push([...built, words.slice(start).join(" ")]);
      return;
    }
    const lastStart = words.length - (linesLeft - 1);
    for (let end = start + 1; end <= lastStart; end += 1) {
      walk(end, linesLeft - 1, [...built, words.slice(start, end).join(" ")]);
    }
  };
  const limit = Math.min(maxLines, words.length);
  for (let lines = 1; lines <= limit; lines += 1) walk(0, lines, []);
  return breaks;
}

/**
 * Largest type that fits the zone. Tries every word break on 1, 2 and 3 lines
 * and keeps the break whose maximum size is the biggest.
 */
export function fitTitle(
  text: string,
  maxWidth: number,
  maxHeight: number,
  measure: (lines: string[], fontSize: number) => TitleMeasure,
): FittedTitle {
  const options = titleBreaks(text.toUpperCase(), 3);
  let best: FittedTitle = { lines: options[0] ?? [text], fontSize: 10 };
  if (maxWidth <= 0 || maxHeight <= 0) return best;

  for (const lines of options) {
    let low = 10;
    let high = 220;
    let size = 10;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const box = measure(lines, mid);
      if (box.width <= maxWidth && box.height <= maxHeight) {
        size = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (size > best.fontSize || (size === best.fontSize && lines.length < best.lines.length)) {
      best = { lines, fontSize: size };
    }
  }
  return best;
}
