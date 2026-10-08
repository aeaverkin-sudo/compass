import { MARK } from "@/shared/components/aded-wordmark";

/** One letter of the wordmark, in grid cells, before the right-hand crop. */
const LETTERS = [
  { x0: 0, x1: 11, y0: 4, y1: 16 },
  { x0: 14, x1: 25, y0: 0, y1: 16 },
  { x0: 28, x1: 39, y0: 4, y1: 16 },
  { x0: 42, x1: 53, y0: 0, y1: 16 },
] as const;

/** Columns kept after the crop. 10 and 11 are the two right-hand cells of each letter. */
const KEPT_COLUMNS = 10;
const ROW_GAP = 1;

function letterCells(letter: (typeof LETTERS)[number], top: number) {
  const cells: { x: number; y: number }[] = [];
  for (const [x, y, width, height] of MARK) {
    for (let row = y; row < y + height; row += 1) {
      if (row < letter.y0 || row > letter.y1) continue;
      for (let col = x; col < x + width; col += 1) {
        if (col < letter.x0 || col > letter.x1) continue;
        const localX = col - letter.x0;
        if (localX >= KEPT_COLUMNS) continue;
        cells.push({ x: localX, y: top + (row - letter.y0) });
      }
    }
  }
  return cells;
}

/** a, d, e, d down the edge. Each letter keeps columns 0–9 and one blank row sits between them. */
const CELLS = LETTERS.flatMap((letter, index) => {
  const top = LETTERS.slice(0, index).reduce((sum, previous) => sum + (previous.y1 - previous.y0 + 1) + ROW_GAP, 0);
  return letterCells(letter, top);
});

const VIEW_W = 10.06;
const VIEW_H = 63.12;

/** Vertical ADED mark, cropped so it sits against the card's right edge. */
export function AdedEdgeMark({ height }: { height: number }) {
  return (
    <svg
      viewBox={`-0.06 -0.06 ${VIEW_W} ${VIEW_H}`}
      width={height * (VIEW_W / VIEW_H)}
      height={height}
      aria-hidden
      style={{ display: "block", pointerEvents: "none" }}
    >
      {CELLS.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x}
          y={cell.y}
          width={1}
          height={1}
          fill="none"
          stroke="#E8640C"
          strokeWidth={0.1}
        />
      ))}
    </svg>
  );
}
