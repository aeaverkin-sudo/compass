"use client";

import { useRef } from "react";

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function useSwipe({ onSwipeLeft, onSwipeRight }: SwipeHandlers) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      tracking.current = true;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!tracking.current) return;
      const dx = Math.abs(e.touches[0].clientX - startX.current);
      const dy = Math.abs(e.touches[0].clientY - startY.current);
      if (dy > dx && dy > 10) tracking.current = false;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!tracking.current) return;
      tracking.current = false;
      const endX = e.changedTouches[0].clientX;
      const diff = endX - startX.current;
      if (Math.abs(diff) < 60) return;
      if (diff < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
  };
}
