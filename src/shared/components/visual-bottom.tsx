"use client";

import { useLayoutEffect } from "react";

/** Taller than this is the keyboard, which the edit dock already follows. */
const KEYBOARD_MIN_PX = 120;

/**
 * How many pixels the layout box extends below the visible screen.
 * Written on the root so the main sky band can lift its bottom edge
 * without resizing the card. One frame, no React render.
 */
export function VisualBottom() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const write = () => {
      frame = 0;
      const vv = window.visualViewport;
      if (!vv) {
        root.style.setProperty("--vv-bottom", "0px");
        return;
      }
      const covered = root.getBoundingClientRect().bottom - vv.height;
      const inset = covered > KEYBOARD_MIN_PX ? 0 : Math.max(0, Math.round(covered));
      root.style.setProperty("--vv-bottom", `${inset}px`);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(write);
    };

    write();
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return null;
}
