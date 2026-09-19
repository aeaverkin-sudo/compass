"use client";

import { useCallback, useEffect, useRef } from "react";

const MOVE_TOLERANCE_PX = 10;

/** Long press; the click right after a fired long press is swallowed. */
export function useLongPress(onLongPress: () => void, delayMs: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const origin = useRef({ x: 0, y: 0 });

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delayMs);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!timer.current) return;
      const dx = Math.abs(event.clientX - origin.current.x);
      const dy = Math.abs(event.clientY - origin.current.y);
      if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClick: (event: React.MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  };
}
