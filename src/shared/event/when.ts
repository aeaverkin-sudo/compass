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

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/** Date, then time when the organiser set one. Midnight stays a date only. */
export function formatEventWhen(iso: string | null): string | null {
  const date = parsed(iso);
  if (!date) return null;
  const day = dayLabel(date);
  if (isMidnight(date)) return day;
  return `${day} · ${clock(date)}`;
}

/** Date and the public place, for a link preview. A secret place stays the public line. */
export function eventShareLine(
  date: string | null,
  endsAt: string | null,
  place: string | null,
  placeSecret: boolean,
): string | null {
  const when = formatEventRange(date, endsAt);
  const where = placeSecret ? "Revealed closer to the date" : place?.trim() || null;
  const bits = [when, where].filter((bit): bit is string => Boolean(bit));
  return bits.length > 0 ? bits.join(" · ") : null;
}

/** Date, place, and the price label. A free event keeps the date and place only. */
export function eventPreviewLine(
  date: string | null,
  endsAt: string | null,
  place: string | null,
  placeSecret: boolean,
  price: string | null,
): string | null {
  const share = eventShareLine(date, endsAt, place, placeSecret);
  const fare = price?.trim() || null;
  const bits = [share, fare].filter((bit): bit is string => Boolean(bit));
  return bits.length > 0 ? bits.join(" · ") : null;
}

/** «11 Oct 2026 · 15:00–19:00». No end keeps the start. No start is nothing. */
export function formatEventRange(startIso: string | null, endIso: string | null): string | null {
  const start = parsed(startIso);
  if (!start) return null;
  const end = parsed(endIso);
  if (!end || isMidnight(end)) return formatEventWhen(startIso);
  if (!sameDay(start, end)) {
    const startWhen = formatEventWhen(startIso);
    const endWhen = formatEventWhen(endIso);
    return startWhen && endWhen ? `${startWhen} – ${endWhen}` : startWhen;
  }
  if (isMidnight(start)) return `${dayLabel(start)} · ${clock(end)}`;
  return `${dayLabel(start)} · ${clock(start)}–${clock(end)}`;
}

/** «19 Oct 2026» — день, короткий месяц, год (без времени). */
export function eventDayLong(iso: string | null): string | null {
  const date = parsed(iso);
  return date ? dayLabel(date) : null;
}

/** «19 / 10» — день / месяц. */
export function eventDaySlash(iso: string | null): string | null {
  const date = parsed(iso);
  return date ? `${date.getDate()} / ${date.getMonth() + 1}` : null;
}

/** «19:43 – 22:43». Нет конца, другой день или полночь начала → одно время или null. */
export function eventTimeRange(startIso: string | null, endIso: string | null): string | null {
  const start = parsed(startIso);
  if (!start || isMidnight(start)) return null;
  const startClock = clock(start);
  const end = parsed(endIso);
  if (!end || isMidnight(end) || !sameDay(start, end)) return startClock;
  return `${startClock} – ${clock(end)}`;
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
