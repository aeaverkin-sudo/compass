"use client";

import { useRef, type ComponentProps, type PointerEvent } from "react";
import { REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";

/**
 * Fires on the finger lifting. Safari's delayed click after a tap is ignored.
 * Keyboard clicks (Enter / Space) still go through onClick.
 * A slide that looks like a scroll is not a tap.
 */
export function TapButton({
  onTap,
  onPrepare,
  ...props
}: Omit<ComponentProps<"button">, "onClick" | "onPointerDown" | "onPointerUp" | "onPointerCancel"> & {
  onTap: () => void;
  /**
   * Finger landing. May only clear `disabled` when the session check has already finished.
   * The action stays on the finger lifting, so a scroll is not a tap.
   */
  onPrepare?: () => void;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const stillATap = (event: PointerEvent<HTMLButtonElement>) => {
    const start = origin.current;
    origin.current = null;
    if (event.pointerType === "mouse" && event.button !== 0) return false;
    if (event.currentTarget.disabled) return false;
    if (!start) return true;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    return dx * dx + dy * dy <= REORDER_SLOP_PX * REORDER_SLOP_PX;
  };
  return (
    <button
      type="button"
      {...props}
      onPointerDown={(event) => {
        origin.current = { x: event.clientX, y: event.clientY };
        onPrepare?.();
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (stillATap(event)) onTap();
      }}
      onPointerCancel={() => {
        origin.current = null;
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.detail === 0) onTap();
        else event.preventDefault();
      }}
    />
  );
}
