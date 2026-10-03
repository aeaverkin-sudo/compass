/** Invite covers. `--event-theme-{id}` is the ground, `--event-theme-{id}-ink` is the type. */
export const EVENT_THEMES = [
  { id: "paper", label: "Paper", ground: "#ffffff", ink: "#111111", dark: false },
  { id: "stone", label: "Stone", ground: "#ebebeb", ink: "#111111", dark: false },
  { id: "sky", label: "Sky", ground: "#c5e8f7", ink: "#111111", dark: false },
  { id: "orange", label: "Orange", ground: "#E8640C", ink: "#111111", dark: false },
  { id: "blue", label: "Blue", ground: "#1f3bd6", ink: "#ffffff", dark: true },
  { id: "noir", label: "Noir", ground: "#111111", ink: "#ffffff", dark: true },
] as const;

export type EventThemeId = (typeof EVENT_THEMES)[number]["id"];

export const EVENT_LAYOUTS = [
  { id: "grid", label: "Clear", defaultTheme: "paper" },
  { id: "corners", label: "Fine", defaultTheme: "noir" },
  { id: "oversized", label: "Bold", defaultTheme: "orange" },
] as const;

export type EventLayoutId = (typeof EVENT_LAYOUTS)[number]["id"];

const RETIRED_THEMES: Record<string, EventThemeId> = {
  butter: "stone",
  peach: "stone",
  lilac: "stone",
  mint: "stone",
  clay: "stone",
  sand: "stone",
  mist: "stone",
  ink: "noir",
  night: "noir",
  cobalt: "blue",
};

export function isEventTheme(value: string): value is EventThemeId {
  return EVENT_THEMES.some((theme) => theme.id === value);
}

export function isEventLayout(value: string): value is EventLayoutId {
  return EVENT_LAYOUTS.some((layout) => layout.id === value);
}

/** A stored name from an older palette still opens. Anything else is paper. */
export function eventThemeFromStored(value: string): EventThemeId {
  if (isEventTheme(value)) return value;
  return RETIRED_THEMES[value] ?? "paper";
}

export function eventThemeById(id: EventThemeId) {
  return EVENT_THEMES.find((theme) => theme.id === id) ?? EVENT_THEMES[0];
}

export function layoutDefaultTheme(id: EventLayoutId): EventThemeId {
  return EVENT_LAYOUTS.find((layout) => layout.id === id)?.defaultTheme ?? "paper";
}
