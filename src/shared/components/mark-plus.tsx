import { cn } from "@/lib/utils";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Rail Share/Scan frame only (lucide). Not used for MarkPlus —
 * the plus is built from TabBand capital I, not this box.
 */
export const CAPS_PX = 13;
export const CAP_HEIGHT_PX = CAPS_PX * 0.714;
export const MARK_SCALE = 1.25;
export const MARK_VISIBLE_PX = CAP_HEIGHT_PX * MARK_SCALE;
export const MARK_PX = (MARK_VISIBLE_PX * 24) / 19;
export const RAIL_STROKE_PX = 0.9;

/**
 * Plus in Edit and on the QR rail: two capital I crossed.
 * Same face, size, and weight as PROFILE · EDIT · NETWORK · OK.
 */
export function MarkPlus({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center uppercase",
        className,
      )}
      style={{
        fontFamily: FONT,
        fontSize: CAPS_PX,
        fontWeight: 300,
        lineHeight: 1,
        letterSpacing: 0,
        width: "1em",
        height: "1em",
      }}
    >
      <span className="absolute inset-0 flex items-center justify-center">I</span>
      <span className="absolute inset-0 flex items-center justify-center rotate-90">I</span>
    </span>
  );
}
