"use client";

import { useLayoutEffect } from "react";

/** Taller than this is the keyboard, which the edit dock already follows. */
const KEYBOARD_MIN_PX = 120;

function readSafeBottom() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)";
  document.documentElement.appendChild(probe);
  const size = probe.getBoundingClientRect().height;
  probe.remove();
  return size;
}

/**
 * The shell is already 100svh, so the first frame is the small viewport.
 * visualViewport only nudges the band if that shell still slips under the toolbar.
 * The band stays hidden until this runs, which is before the first paint.
 */
export function VisualBottom() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const write = () => {
      frame = 0;
      const vv = window.visualViewport;
      const shell = document.querySelector("main.compass-main");
      let lift = 0;
      if (vv && shell) {
        const gap = shell.getBoundingClientRect().bottom - vv.height;
        if (gap > 0 && gap < KEYBOARD_MIN_PX) lift = Math.round(gap);
      }
      const chrome = vv ? root.getBoundingClientRect().bottom - vv.height : 0;
      const safe = chrome > 8 && chrome < KEYBOARD_MIN_PX ? 0 : Math.round(readSafeBottom());
      root.style.setProperty("--vv-bottom", `${lift}px`);
      root.style.setProperty("--band-safe", `${safe}px`);
      root.classList.add("compass-band-ready");
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

  return (
    <style>{`
      .compass-sky-band { visibility: hidden; transition: none; }
      html.compass-band-ready .compass-sky-band { visibility: visible; }
    `}</style>
  );
}
