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
 * by that amount. The new-line field follows that shift. An existing row does not move
 * the card: its box sits on the keyboard, and a second lift would paint the text on the name.
 */
export function useKeyboardDock(active: boolean, followOffset = false) {
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
      if (followOffset && root instanceof HTMLElement) {
        root.style.transform = offset > 1 ? `translateY(${offset}px)` : "";
      }
      if (offset < 2 && overlap > KEYBOARD_MIN_PX) remembered = overlap;
      if (offset < 2 && overlap <= KEYBOARD_MIN_PX) remembered = 0;
      const keyboard = remembered > 0 ? remembered : overlap;
      // The new line drops with the card. An existing row just sits on the keyboard:
      // a second lift paints its text over the name.
      setInset(followOffset ? Math.max(0, keyboard - offset) : overlap > KEYBOARD_MIN_PX ? overlap : keyboard);
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
  }, [active, followOffset]);

  return inset;
}
