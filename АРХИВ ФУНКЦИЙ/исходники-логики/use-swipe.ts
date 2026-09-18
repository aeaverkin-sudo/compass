"use client";

import { useRef } from "react";

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
}: SwipeHandlers) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      tracking.current = true;
    },
    onTouchMove: () => {
      /* keep tracking until touchend */
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!tracking.current) return;
      tracking.current = false;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX.current;
      const dy = endY - startY.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < 50 && absDy < 50) return;
      if (absDx > absDy) {
        if (absDx < 60) return;
        if (dx < 0) onSwipeLeft?.();
        else onSwipeRight?.();
      } else {
        if (absDy < 60) return;
        if (dy < 0) onSwipeUp?.();
        else onSwipeDown?.();
      }
    },
  };
}
