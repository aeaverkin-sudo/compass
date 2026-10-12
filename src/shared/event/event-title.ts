/** The event title keeps up to three lines; style 1 prints them as typed. */
export const EVENT_TITLE_LINES = 3;

/** Keeps the first lines and joins the rest into the last one. */
export function clampEventTitle(value: string): string {
  const parts = value.replace(/\r\n?/g, "\n").split("\n");
  if (parts.length <= EVENT_TITLE_LINES) return parts.join("\n");
  return [...parts.slice(0, EVENT_TITLE_LINES - 1), parts.slice(EVENT_TITLE_LINES - 1).join(" ")].join("\n");
}

/** The title on one line, for everything but style 1. */
export function eventTitleLine(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, " ").trim();
}
