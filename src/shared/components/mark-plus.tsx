import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cap size of the sheet count (`t-caps` Light). Rail Share and Scan frames; not the plus. */
export const CAPS_PX = 13;
export const CAP_HEIGHT_PX = CAPS_PX * 0.714;
export const MARK_SCALE = 1.25;
export const MARK_VISIBLE_PX = CAP_HEIGHT_PX * MARK_SCALE;
/** One svg frame for rail Share and Scan (visible glyph ≈ 19/24 of the box). */
export const MARK_PX = (MARK_VISIBLE_PX * 24) / 19;
/** Screen stroke — matches the Light 1/3 stem (~0.9 px). */
export const RAIL_STROKE_PX = 0.9;

/** The Edit row plus: 20 px, stroke 1, currentColor. Rail svg overrides skip `data-mark-plus`. */
export function MarkPlus({ className }: { className?: string }) {
  return <Plus data-mark-plus className={cn("size-5 shrink-0", className)} strokeWidth={1} aria-hidden />;
}
