/** Cover colours for an event invite. Names match `--event-theme-*`. */
export const EVENT_THEMES = [
  { id: "paper", label: "Paper" },
  { id: "ink", label: "Ink" },
  { id: "sky", label: "Sky" },
  { id: "sand", label: "Sand" },
  { id: "stone", label: "Stone" },
  { id: "clay", label: "Clay" },
  { id: "mist", label: "Mist" },
  { id: "night", label: "Night" },
] as const;

export type EventThemeId = (typeof EVENT_THEMES)[number]["id"];

export function isEventTheme(value: string): value is EventThemeId {
  return EVENT_THEMES.some((theme) => theme.id === value);
}
