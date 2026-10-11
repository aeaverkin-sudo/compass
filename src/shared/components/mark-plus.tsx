import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** `t-caps` 13, счётчик листов; плашка — `t-band` 14, к значкам не относится. */
const CAPS_PX = 13;
const CAP_HEIGHT_PX = CAPS_PX * 0.714;
const MARK_SCALE = 1.25;
const MARK_VISIBLE_PX = CAP_HEIGHT_PX * MARK_SCALE;
/** One svg frame for rail Share and Scan (visible glyph ≈ 19/24 of the box). */
export const MARK_PX = (MARK_VISIBLE_PX * 24) / 19;
/** Screen stroke — matches the Light 1/3 stem (~0.9 px). */
export const RAIL_STROKE_PX = 0.9;

/** The Edit row plus: 20 px, stroke 1, currentColor. */
export function MarkPlus({ className }: { className?: string }) {
  return <Plus className={cn("size-5 shrink-0", className)} strokeWidth={1} aria-hidden />;
}
