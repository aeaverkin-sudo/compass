import { eventTimeZone, zonedParts, type ZonedParts } from "@/shared/event/time-zone";

/** Every event time is read in the event's own zone, never the viewer's or the server's. */
type Zone = string | null | undefined;

type Moment = { date: Date; parts: ZonedParts; zone: string };

function parsed(iso: string | null, timeZone: Zone): Moment | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const zone = eventTimeZone(timeZone);
  return { date, parts: zonedParts(date, zone), zone };
}

function isMidnight(moment: Moment): boolean {
  return moment.parts.hour === 0 && moment.parts.minute === 0;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(moment: Moment): string {
  return `${pad(moment.parts.hour)}:${pad(moment.parts.minute)}`;
}

function dayLabel(moment: Moment): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: moment.zone,
  }).format(moment.date);
}

function sameDay(left: Moment, right: Moment): boolean {
  return (
    left.parts.year === right.parts.year &&
    left.parts.month === right.parts.month &&
    left.parts.day === right.parts.day
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The end comes after the start by less than a day: one evening, even past midnight. */
export function sameEvening(start: Date, end: Date): boolean {
  const gap = end.getTime() - start.getTime();
  return gap > 0 && gap < DAY_MS;
}

/** Date, then time when the organiser set one. Midnight stays a date only. */
export function formatEventWhen(iso: string | null, timeZone?: Zone): string | null {
  const moment = parsed(iso, timeZone);
  if (!moment) return null;
  const day = dayLabel(moment);
  if (isMidnight(moment)) return day;
  return `${day} · ${clock(moment)}`;
}

/** Date and the public place, for a link preview. A secret place stays the public line. */
export function eventShareLine(
  date: string | null,
  endsAt: string | null,
  place: string | null,
  placeSecret: boolean,
  timeZone?: Zone,
): string | null {
  const when = formatEventRange(date, endsAt, timeZone);
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
  timeZone?: Zone,
): string | null {
  const share = eventShareLine(date, endsAt, place, placeSecret, timeZone);
  const fare = price?.trim() || null;
  const bits = [share, fare].filter((bit): bit is string => Boolean(bit));
  return bits.length > 0 ? bits.join(" · ") : null;
}

/** «11 Oct 2026 · 15:00–19:00». No end keeps the start. No start is nothing. */
export function formatEventRange(startIso: string | null, endIso: string | null, timeZone?: Zone): string | null {
  const start = parsed(startIso, timeZone);
  if (!start) return null;
  const end = parsed(endIso, timeZone);
  if (end && sameEvening(start.date, end.date) && !isMidnight(start)) {
    return `${dayLabel(start)} · ${clock(start)}–${clock(end)}`;
  }
  if (!end || isMidnight(end)) return formatEventWhen(startIso, timeZone);
  if (!sameDay(start, end)) {
    const startWhen = formatEventWhen(startIso, timeZone);
    const endWhen = formatEventWhen(endIso, timeZone);
    return startWhen && endWhen ? `${startWhen} – ${endWhen}` : startWhen;
  }
  if (isMidnight(start)) return `${dayLabel(start)} · ${clock(end)}`;
  return `${dayLabel(start)} · ${clock(start)}–${clock(end)}`;
}

/** «19 Oct 2026» — день, короткий месяц, год (без времени). */
export function eventDayLong(iso: string | null, timeZone?: Zone): string | null {
  const moment = parsed(iso, timeZone);
  return moment ? dayLabel(moment) : null;
}

/** «19 / 10» — день / месяц. */
export function eventDaySlash(iso: string | null, timeZone?: Zone): string | null {
  const moment = parsed(iso, timeZone);
  return moment ? `${moment.parts.day} / ${moment.parts.month}` : null;
}

/** «19:43 – 22:43». Нет конца, другой день или полночь начала → одно время или null. */
export function eventTimeRange(startIso: string | null, endIso: string | null, timeZone?: Zone): string | null {
  const start = parsed(startIso, timeZone);
  if (!start || isMidnight(start)) return null;
  const startClock = clock(start);
  const end = parsed(endIso, timeZone);
  if (end && sameEvening(start.date, end.date)) return `${startClock} – ${clock(end)}`;
  if (!end || isMidnight(end) || !sameDay(start, end)) return startClock;
  return `${startClock} – ${clock(end)}`;
}

/** 12 · 11 · 2026 */
export function dottedDate(iso: string | null, timeZone?: Zone): string | null {
  const moment = parsed(iso, timeZone);
  if (!moment) return null;
  return `${moment.parts.day} · ${moment.parts.month} · ${moment.parts.year}`;
}

/** «12.10.26» */
export function shortDate(iso: string | null, timeZone?: Zone): string {
  const moment = parsed(iso, timeZone);
  if (!moment) return "";
  return `${pad(moment.parts.day)}.${pad(moment.parts.month)}.${String(moment.parts.year).slice(2)}`;
}

/** «15:30–20:30». An end on another day drops; a midnight start with no end is a date only. */
export function shortTimeRange(startIso: string | null, endIso: string | null, timeZone?: Zone): string {
  const start = parsed(startIso, timeZone);
  if (!start) return "";
  const end = parsed(endIso, timeZone);
  const kept = end && (sameDay(start, end) || sameEvening(start.date, end.date));
  const endClock = end && kept ? clock(end) : "";
  const startClock = clock(start);
  if (startClock === "00:00" && !endClock) return "";
  return endClock ? `${startClock}–${endClock}` : startClock;
}

/** 12 NOV / 19:00. Midnight drops the time. */
export function fashionWhen(iso: string | null, timeZone?: Zone): string | null {
  const moment = parsed(iso, timeZone);
  if (!moment) return null;
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: moment.zone })
    .format(moment.date)
    .toUpperCase();
  const day = `${moment.parts.day} ${month}`;
  if (isMidnight(moment)) return day;
  return `${day} / ${clock(moment)}`;
}

export function eventClock(iso: string | null, timeZone?: Zone): string | null {
  const moment = parsed(iso, timeZone);
  if (!moment || isMidnight(moment)) return null;
  return clock(moment);
}

export function eventYear(iso: string | null, timeZone?: Zone): number {
  return parsed(iso, timeZone)?.parts.year ?? new Date().getFullYear();
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
