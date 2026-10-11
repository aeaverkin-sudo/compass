const MARK: [number, number, number, number][] = [
  [22, 0, 4, 1],
  [50, 0, 4, 1],
  [22, 1, 4, 1],
  [50, 1, 4, 1],
  [22, 2, 4, 1],
  [50, 2, 4, 1],
  [22, 3, 4, 1],
  [50, 3, 4, 1],
  [2, 4, 8, 1],
  [16, 4, 10, 1],
  [30, 4, 8, 1],
  [44, 4, 10, 1],
  [2, 5, 8, 1],
  [16, 5, 10, 1],
  [30, 5, 8, 1],
  [44, 5, 10, 1],
  [2, 6, 8, 1],
  [16, 6, 10, 1],
  [30, 6, 8, 1],
  [44, 6, 10, 1],
  [8, 7, 4, 1],
  [14, 7, 4, 1],
  [22, 7, 4, 1],
  [28, 7, 4, 1],
  [36, 7, 4, 1],
  [42, 7, 4, 1],
  [50, 7, 4, 1],
  [8, 8, 4, 1],
  [14, 8, 4, 1],
  [22, 8, 4, 1],
  [28, 8, 4, 1],
  [36, 8, 4, 1],
  [42, 8, 4, 1],
  [50, 8, 4, 1],
  [2, 9, 10, 1],
  [14, 9, 4, 1],
  [22, 9, 4, 1],
  [28, 9, 12, 1],
  [42, 9, 4, 1],
  [50, 9, 4, 1],
  [2, 10, 10, 1],
  [14, 10, 4, 1],
  [22, 10, 4, 1],
  [28, 10, 12, 1],
  [42, 10, 4, 1],
  [50, 10, 4, 1],
  [0, 11, 12, 1],
  [14, 11, 4, 1],
  [22, 11, 4, 1],
  [28, 11, 12, 1],
  [42, 11, 4, 1],
  [50, 11, 4, 1],
  [0, 12, 4, 1],
  [8, 12, 4, 1],
  [14, 12, 4, 1],
  [22, 12, 4, 1],
  [28, 12, 4, 1],
  [42, 12, 4, 1],
  [50, 12, 4, 1],
  [0, 13, 4, 1],
  [8, 13, 4, 1],
  [14, 13, 4, 1],
  [22, 13, 4, 1],
  [28, 13, 4, 1],
  [42, 13, 4, 1],
  [50, 13, 4, 1],
  [2, 14, 10, 1],
  [16, 14, 10, 1],
  [30, 14, 10, 1],
  [44, 14, 10, 1],
  [2, 15, 10, 1],
  [16, 15, 10, 1],
  [30, 15, 10, 1],
  [44, 15, 10, 1],
  [2, 16, 10, 1],
  [16, 16, 10, 1],
  [30, 16, 10, 1],
  [44, 16, 10, 1],
];

/** Unit cells from MARK — one [x, y] per grid square. */
const MESH_CELLS: [number, number][] = MARK.flatMap(([x, y, w, h]) => {
  const cells: [number, number][] = [];
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      cells.push([x + dx, y + dy]);
    }
  }
  return cells;
});

const MESH_STROKE = 0.14;

/** Pixel wordmark. Orange unless `color` is set. Height follows the 54×17 grid. */
export function AdedWordmark({
  className,
  color,
  variant = "solid",
}: {
  className?: string;
  color?: string;
  variant?: "solid" | "mesh";
}) {
  const s = MESH_STROKE;
  return (
    <svg
      viewBox="0 0 54 17"
      role="img"
      aria-label="ADED"
      shapeRendering="crispEdges"
      className={className ?? "block h-auto w-full"}
      style={{ color: color ?? "#E8640C" }}
    >
      {variant === "mesh"
        ? MESH_CELLS.map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x + s / 2}
              y={y + s / 2}
              width={1 - s}
              height={1 - s}
              fill="none"
              stroke="currentColor"
              strokeWidth={s}
            />
          ))
        : MARK.map(([x, y, width, height]) => (
            <rect key={`${x}-${y}-${width}`} x={x} y={y} width={width} height={height} fill="currentColor" />
          ))}
    </svg>
  );
}
