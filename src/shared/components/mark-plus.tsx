import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** `t-caps` 13, счётчик листов; плашка — `t-band` 14, к значкам не относится. */
const CAPS_PX = 13;
const CAP_HEIGHT_PX = CAPS_PX * 0.714;
const MARK_SCALE = 1.25;
const MARK_VISIBLE_PX = CAP_HEIGHT_PX * MARK_SCALE;
/** One svg frame for rail Share and Scan, 10% above the cap-matched mark. */
export const MARK_PX = ((MARK_VISIBLE_PX * 24) / 19) * 1.1;
/** Toolbar plus only. The Edit-row MarkPlus stays 20. */
export const RAIL_PLUS_PX = 22;
/** Screen stroke — matches the Light 1/3 stem (~0.9 px). */
export const RAIL_STROKE_PX = 0.9;

/** The Edit row plus: 20 px, stroke 1, currentColor. */
export function MarkPlus({
  className,
  strokeWidth = 1,
  size = 20,
}: {
  className?: string;
  strokeWidth?: number;
  size?: number;
}) {
  return <Plus className={cn("shrink-0", className)} size={size} strokeWidth={strokeWidth} aria-hidden />;
}
