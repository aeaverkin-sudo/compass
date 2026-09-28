"use client";

import { useEffect, useState } from "react";

/** A keyboard is at least this tall; smaller viewport changes are the browser chrome. */
const KEYBOARD_MIN_PX = 120;

function pageRoot() {
  return document.querySelector(".compass-main");
}

/**
 * While `active`, returns how far a `position: fixed; bottom: 0` line must be padded
 * so its text sits on the keyboard.
 *
 * iOS shifts the visual viewport when the field is tapped again after the file sheet.
 * That shift hides the QR and, if the old keyboard height is kept, leaves a white gap
 * under the line. Move the card back and use the live overlap instead.
 */
export function useKeyboardDock(active: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    let remembered = 0;
    const sync = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const offset = Math.max(0, vv.offsetTop);
      const overlap = Math.max(0, window.innerHeight - offset - vv.height);
      const root = pageRoot();
      if (root instanceof HTMLElement) {
        root.style.transform = offset > 1 ? `translateY(${offset}px)` : "";
      }
      if (offset < 2 && overlap > KEYBOARD_MIN_PX) remembered = overlap;
      // Sheet hides the keyboard: keep the line at the last real keyboard height.
      // After the sheet, iOS has scrolled: the live overlap is the right padding.
      setInset(offset > 1 ? overlap : remembered || overlap);
    };
    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      const root = pageRoot();
      if (root instanceof HTMLElement) root.style.transform = "";
      setInset(0);
    };
  }, [active]);

  return inset;
}
