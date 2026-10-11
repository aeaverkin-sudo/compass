import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cap size of the sheet count (`t-caps` Light). Turn the dial with MARK_SCALE only. */
export const CAPS_PX = 13;
export const CAP_HEIGHT_PX = CAPS_PX * 0.714;
export const MARK_SCALE = 1.25;
export const MARK_VISIBLE_PX = CAP_HEIGHT_PX * MARK_SCALE;
/** One svg frame for Share, Scan, and Plus (visible glyph ≈ 19/24 of the box). */
export const MARK_PX = (MARK_VISIBLE_PX * 24) / 19;
/** Screen stroke — matches the Light 1/3 stem (~0.9 px). */
export const RAIL_STROKE_PX = 0.9;

/** Same plus as the QR rail mark. Size and stroke come from MARK_PX / RAIL_STROKE_PX. */
export function MarkPlus({ className }: { className?: string }) {
  return (
    <Plus
      className={cn(
        "shrink-0 text-current [&_*]:[vector-effect:non-scaling-stroke]",
        className,
      )}
      width={MARK_PX}
      height={MARK_PX}
      strokeWidth={RAIL_STROKE_PX}
      strokeLinecap="round"
      aria-hidden
    />
  );
}
