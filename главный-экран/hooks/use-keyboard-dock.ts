"use client";

import { useEffect, useState } from "react";

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** Mouse and trackpad: no software keyboard, so a heading stays in its row. */
export function useFinePointer() {
  const [fine, setFine] = useState(
    () => typeof window !== "undefined" && window.matchMedia(FINE_POINTER).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(FINE_POINTER);
    const sync = () => setFine(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return fine;
}

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

function typingFocused() {
  const node = document.activeElement;
  if (!(node instanceof HTMLElement)) return false;
  return node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement || node.isContentEditable;
}

/**
 * Tallest visual viewport since the last turn. Shared by every field: a row that
 * opens while the keyboard is already up must not start from that short height.
 */
let visibleMax = 0;

/** True while a text field is focused and the keyboard covers the bottom. Scroll without a field does not count. */
export function useKeyboardVisible() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let adoptNext = false;
    const sync = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      if (vv.height > visibleMax) visibleMax = vv.height;
      const dropped = visibleMax - vv.height > KEYBOARD_MIN_PX;
      const overlap = Math.max(0, window.innerHeight - Math.max(0, vv.offsetTop) - vv.height);
      setUp(typingFocused() && (dropped || overlap > KEYBOARD_MIN_PX));
    };
    const onResize = () => {
      const vv = window.visualViewport;
      if (adoptNext && vv) {
        visibleMax = vv.height;
        adoptNext = false;
      }
      sync();
    };
    const syncFocus = () => {
      window.setTimeout(sync, 0);
    };
    const onOrient = () => {
      adoptNext = true;
    };
    sync();
    viewport.addEventListener("resize", onResize);
    viewport.addEventListener("scroll", sync);
    document.addEventListener("focusin", syncFocus);
    document.addEventListener("focusout", syncFocus);
    window.addEventListener("orientationchange", onOrient);
    return () => {
      viewport.removeEventListener("resize", onResize);
      viewport.removeEventListener("scroll", sync);
      document.removeEventListener("focusin", syncFocus);
      document.removeEventListener("focusout", syncFocus);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, []);
  return up;
}
