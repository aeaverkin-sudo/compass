import type { CardStatus } from "@/shared/types";

/** Narrows a raw DB status string to a known CardStatus, defaulting to "draft". */
export function asCardStatus(value: string): CardStatus {
  if (value === "published" || value === "archived" || value === "suspended") return value;
  return "draft";
}
