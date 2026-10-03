function parsed(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isMidnight(date: Date): boolean {
  return date.getHours() === 0 && date.getMinutes() === 0;
}

function clock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Date, then time when the organiser set one. Midnight stays a date only. */
export function formatEventWhen(iso: string | null): string | null {
  const date = parsed(iso);
  if (!date) return null;
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  if (isMidnight(date)) return day;
  return `${day} · ${clock(date)}`;
}

/** 12 · 11 · 2026 */
export function dottedDate(iso: string | null): string | null {
  const date = parsed(iso);
  if (!date) return null;
  return `${date.getDate()} · ${date.getMonth() + 1} · ${date.getFullYear()}`;
}

/** 12 NOV / 19:00. Midnight drops the time. */
export function fashionWhen(iso: string | null): string | null {
  const date = parsed(iso);
  if (!date) return null;
  const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date).toUpperCase();
  const day = `${date.getDate()} ${month}`;
  if (isMidnight(date)) return day;
  return `${day} / ${clock(date)}`;
}

export function eventClock(iso: string | null): string | null {
  const date = parsed(iso);
  if (!date || isMidnight(date)) return null;
  return clock(date);
}

export function eventYear(iso: string | null): number {
  return parsed(iso)?.getFullYear() ?? new Date().getFullYear();
}

export function romanYear(year: number): string {
  const pairs: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let left = year;
  let out = "";
  for (const [value, glyph] of pairs) {
    while (left >= value) {
      out += glyph;
      left -= value;
    }
  }
  return out;
}
