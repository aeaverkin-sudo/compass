"use client";

import { useEffect, useRef } from "react";
import { SWIPE_BACK, swipeBackFires } from "@/shared/lib/swipe-back";

const CONTROL = "input, textarea, select, button, [data-no-swipe], [contenteditable]";
const HANDLE = "[data-row-handle], [data-rubric-handle]";

function targetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
}

function fieldIsFocused(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && (el.isContentEditable || el.matches("input, textarea, select"));
}

/**
 * Watches a right swipe and calls `onBack` when it qualifies.
 * `enabled` false, or SWIPE_BACK false, attaches nothing.
 * The listener only records the finger. It does not block scrolling.
 */
export function useSwipeBack(enabled: boolean, onBack: () => void, keyboardOpen: () => boolean) {
  const onBackRef = useRef(onBack);
  const keyboardRef = useRef(keyboardOpen);
  onBackRef.current = onBack;
  keyboardRef.current = keyboardOpen;

  useEffect(() => {
    if (!SWIPE_BACK || !enabled) return;

    let tracking = false;
    let touchId = -1;
    let startX = 0;
    let startY = 0;
    let width = 0;
    let onControl = false;
    let onHandle = false;
    let reordering = false;

    const onStart = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch || event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const el = targetElement(event.target);
      tracking = true;
      touchId = touch.identifier;
      startX = touch.clientX;
      startY = touch.clientY;
      width = window.innerWidth;
      onControl = Boolean(el?.closest(CONTROL));
      onHandle = Boolean(el?.closest(HANDLE));
      reordering = Boolean(document.querySelector("[data-reordering]"));
    };

    const onEnd = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.changedTouches[0];
      tracking = false;
      if (!touch || touch.identifier !== touchId) return;
      const fires = swipeBackFires({
        startX,
        startY,
        endX: touch.clientX,
        endY: touch.clientY,
        width,
        onControl,
        onHandle,
        reordering: reordering || Boolean(document.querySelector("[data-reordering]")),
        keyboardOpen: keyboardRef.current(),
        fieldFocused: fieldIsFocused(),
      });
      if (fires) onBackRef.current();
    };

    const onCancel = () => {
      tracking = false;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled]);
}
