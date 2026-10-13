/** Events made before the zone was stored were set in Lisbon. */
export const DEFAULT_EVENT_TIME_ZONE = "Europe/Lisbon";

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** "europe/lisbon" → "Europe/Lisbon". */
export function canonicalTimeZone(value: string): string {
  return isTimeZone(value) ? new Intl.DateTimeFormat("en-GB", { timeZone: value }).resolvedOptions().timeZone : value;
}

export function eventTimeZone(value: string | null | undefined): string {
  return isTimeZone(value) ? value : DEFAULT_EVENT_TIME_ZONE;
}

/** The organiser's zone, read in the browser. */
export function browserTimeZone(): string {
  try {
    return eventTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_EVENT_TIME_ZONE;
  }
}

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

const partFormats = new Map<string, Intl.DateTimeFormat>();

function partFormat(timeZone: string): Intl.DateTimeFormat {
  let format = partFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    partFormats.set(timeZone, format);
  }
  return format;
}

/** The wall clock of the moment in the zone. */
export function zonedParts(date: Date, timeZone: string | null | undefined): ZonedParts {
  const parts = partFormat(eventTimeZone(timeZone)).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
  };
}

function offsetAt(time: number, timeZone: string): number {
  const p = zonedParts(new Date(time), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(time / 60000) * 60000;
}

/** The moment a wall clock "YYYY-MM-DD" + "HH:MM" shows in the zone. Extra days move the date. */
export function zonedIso(day: string, time: string, timeZone: string | null | undefined, addDays = 0): string | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const clock = /^(\d{2}):(\d{2})$/.exec(time || "00:00");
  if (!date || !clock) return null;
  const zone = eventTimeZone(timeZone);
  const wall = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]) + addDays, Number(clock[1]), Number(clock[2]));
  if (Number.isNaN(wall)) return null;
  let moment = wall - offsetAt(wall, zone);
  const settled = offsetAt(moment, zone);
  if (wall - settled !== moment) moment = wall - settled;
  return new Date(moment).toISOString();
}
