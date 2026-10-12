/**
 * Date and time typed as digits on the ADED card invite. One format each: day.month.year and 24h.
 *
 *   shapeInviteDate("121026")      → "12.10.26"
 *   shapeInviteDate("12.102")      → "12.10.2"   (typing on after the shaped dot)
 *   shapeInviteDate("1.2.27")      → "1.2.27"    (separators typed by hand stay)
 *   parseInviteDate("12.10.26")    → "2026-10-12"
 *   parseInviteDate("31.02.26")    → null
 *   shapeInviteTime("15302030")    → "15:30–20:30"
 *   shapeInviteTime("1530")        → "15:30"
 *   parseInviteTime("15:30–20:30") → { start: "15:30", end: "20:30" }
 *   parseInviteTime("25:00")       → null
 */

const DATE_SEPARATORS = /[./\-\s]+/g;
const TIME_SEPARATORS = /[:.\s]+/g;
const TIME_GROUPS = /[:.\s\-–—]+/;
const RANGE = /\s*[-–—]\s*/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Pairs of two digits before the last group mean the dots came from shaping, so the digits are laid out again. */
function shapedBefore(groups: string[]): boolean {
  return groups.slice(0, -1).every((group) => group.length === 2);
}

/** Digits get dots after the day and the month. Separators typed by hand become dots. */
export function shapeInviteDate(raw: string): string {
  if (!/^[\d./\-\s]+$/.test(raw)) return raw;
  if (!shapedBefore(raw.split(DATE_SEPARATORS))) return raw.replace(DATE_SEPARATORS, ".");
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join(".");
}

/** "YYYY-MM-DD" for a real calendar day, else null. A two-digit year is 20YY. */
export function parseInviteDate(text: string): string | null {
  const trimmed = text.trim();
  let day: string;
  let month: string;
  let year: string;
  const compact = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(trimmed);
  if (compact) {
    [, day, month, year] = compact;
  } else {
    const parts = trimmed.split(DATE_SEPARATORS);
    if (parts.length !== 3 || !parts.every((part) => /^\d+$/.test(part))) return null;
    [day, month, year] = parts as [string, string, string];
    if (day.length > 2 || month.length > 2 || (year.length !== 2 && year.length !== 4)) return null;
  }
  const y = year.length === 2 ? 2000 + Number(year) : Number(year);
  const m = Number(month);
  const d = Number(day);
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Digits become HH:MM, then a dash and the end. Separators typed by hand become colons. */
export function shapeInviteTime(raw: string): string {
  if (!/^[\d:.\s\-–—]+$/.test(raw)) return raw;
  if (!shapedBefore(raw.split(TIME_GROUPS))) {
    return raw
      .split(RANGE)
      .map((part) => part.replace(TIME_SEPARATORS, ":"))
      .join("–");
  }
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const start = [digits.slice(0, 2), digits.slice(2, 4)].filter(Boolean).join(":");
  const end = [digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join(":");
  return end ? `${start}–${end}` : start;
}

function readClock(text: string): string | null {
  const compact = /^(\d{2})(\d{2})$/.exec(text);
  const split = compact ? null : /^(\d{1,2})[:.\s](\d{2})$/.exec(text);
  const match = compact ?? split;
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

/** Start, and the end when there is one. Null when either clock is not a real time. */
export function parseInviteTime(text: string): { start: string; end: string | null } | null {
  const trimmed = text.trim();
  const compactRange = /^(\d{4})(\d{4})$/.exec(trimmed);
  const parts = compactRange ? [compactRange[1], compactRange[2]] : trimmed.split(RANGE);
  if (parts.length < 1 || parts.length > 2) return null;
  const start = readClock(parts[0] ?? "");
  if (!start) return null;
  if (parts.length === 1) return { start, end: null };
  const end = readClock(parts[1] ?? "");
  return end ? { start, end } : null;
}

/** "12.10.26" from the stored form date "YYYY-MM-DD". */
export function inviteDateText(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}.${match[2]}.${match[1].slice(2)}` : "";
}

/** "15:30–20:30" from the stored form clocks. Midnight with no end means a date only. */
export function inviteTimeText(time: string, endTime: string): string {
  if (!time || (time === "00:00" && !endTime)) return "";
  return endTime ? `${time}–${endTime}` : time;
}
