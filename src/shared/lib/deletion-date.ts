const HOUR_MS = 60 * 60 * 1000;

/** «Sat 18 Oct, 23:00»: en-GB, rounded to the hour. No zone uses the device's. */
export function deletionDateLabel(iso: string, timeZone?: string | null): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const rounded = new Date(Math.round(time / HOUR_MS) * HOUR_MS);
  const zone = timeZone ? { timeZone } : {};
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...zone,
  }).formatToParts(rounded);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}, ${part("hour")}:${part("minute")}`;
}

/** Profile and pass line for an unkept event guest. */
export function deletionLine(iso: string | null): string | null {
  if (!iso) return null;
  return `Your profile will be deleted on ${deletionDateLabel(iso)}. Keep it if you want — free, one tap.`;
}
