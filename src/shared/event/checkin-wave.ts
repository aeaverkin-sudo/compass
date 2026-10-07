const BIN_MS = 10 * 60 * 1000;

export type CheckInWave = {
  bins: number[];
  /** Start of the busiest 10-minute bin. */
  peakAt: string;
  startAt: string;
  endAt: string;
  peakCount: number;
};

function instant(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Ten-minute bins. The event window sets the axis when both ends exist; otherwise the check-ins do. */
export function checkInWave(
  checkedInAt: Array<string | null | undefined>,
  window: { start: string | null; end: string | null },
): CheckInWave | null {
  const times = checkedInAt.map(instant).filter((time): time is number => time != null).sort((a, b) => a - b);
  if (times.length === 0) return null;

  const windowStart = instant(window.start);
  const windowEnd = instant(window.end);
  const bounded = windowStart != null && windowEnd != null && windowEnd > windowStart;
  const start = bounded ? windowStart : times[0]!;
  const end = bounded ? windowEnd : times[times.length - 1]!;
  const origin = Math.floor(start / BIN_MS) * BIN_MS;
  const last = Math.floor(end / BIN_MS) * BIN_MS;
  const count = Math.max(1, Math.round((last - origin) / BIN_MS) + 1);
  const bins = Array.from({ length: count }, () => 0);

  for (const time of times) {
    let index = Math.floor((time - origin) / BIN_MS);
    if (index < 0) index = 0;
    if (index >= bins.length) index = bins.length - 1;
    bins[index] += 1;
  }

  let peakIndex = 0;
  bins.forEach((value, index) => {
    if (value > bins[peakIndex]!) peakIndex = index;
  });

  return {
    bins,
    peakAt: new Date(origin + peakIndex * BIN_MS).toISOString(),
    startAt: new Date(origin).toISOString(),
    endAt: new Date(origin + (bins.length - 1) * BIN_MS).toISOString(),
    peakCount: bins[peakIndex]!,
  };
}
