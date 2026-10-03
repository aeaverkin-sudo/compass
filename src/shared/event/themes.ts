/** Invite covers. `--event-theme-{id}` is the ground, `--event-theme-{id}-ink` is the type. */
export const EVENT_THEMES = [
  { id: "paper", label: "Paper", ink: "#111111" },
  { id: "noir", label: "Noir", ink: "#ffffff" },
  { id: "sky", label: "Sky", ink: "#0f2b36" },
  { id: "butter", label: "Butter", ink: "#3a3413" },
  { id: "peach", label: "Peach", ink: "#4a3115" },
  { id: "lilac", label: "Lilac", ink: "#342a4a" },
  { id: "mint", label: "Mint", ink: "#1f3a28" },
  { id: "clay", label: "Clay", ink: "#403524" },
] as const;

export type EventThemeId = (typeof EVENT_THEMES)[number]["id"];

export function isEventTheme(value: string): value is EventThemeId {
  return EVENT_THEMES.some((theme) => theme.id === value);
}
