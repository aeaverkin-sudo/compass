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
 * After the file sheet, iOS scrolls the visual viewport. The card is shifted back down
 * by that amount. The line is portaled outside the card, so it must drop by the same
 * amount or it stays high and covers the photo and the name.
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
      const keyboard = remembered > 0 ? remembered : overlap;
      setInset(Math.max(0, keyboard - offset));
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
