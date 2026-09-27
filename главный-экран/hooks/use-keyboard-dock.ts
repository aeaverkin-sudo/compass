"use client";

import { useEffect, type RefObject } from "react";

/** A keyboard is at least this tall; smaller viewport changes are browser chrome. */
const KEYBOARD_MIN_PX = 120;
/** First open only: iPhone keyboards with the accessory bar stay below half the screen. */
const FIRST_GUESS_SHARE = 0.5;

const KEYBOARD_STORAGE_KEY = "compass-keyboard-px";

function rememberedKeyboardPx() {
  const stored = Number(window.localStorage.getItem(KEYBOARD_STORAGE_KEY));
  return Number.isFinite(stored) && stored > KEYBOARD_MIN_PX ? stored : 0;
}

function rememberKeyboardPx(px: number) {
  window.localStorage.setItem(KEYBOARD_STORAGE_KEY, String(Math.round(px)));
}

/** Distance from the bottom of the layout viewport up to the top of the keyboard. */
function keyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
}

/**
 * Where to put a docked line before the keyboard has reported its height.
 * It must already sit above the keyboard, or iOS pans the whole page to reveal the caret.
 */
export function initialKeyboardInset() {
  const now = keyboardInset();
  if (now > KEYBOARD_MIN_PX) return now;
  return rememberedKeyboardPx() || Math.round(window.innerHeight * FIRST_GUESS_SHARE);
}

/** Freeze the page and every card scroller; only touches inside `keep` may move. */
function lockBackground(keep: HTMLElement | null) {
  const root = document.documentElement;
  const body = document.body;
  const scrollers = Array.from(document.querySelectorAll<HTMLElement>(".compass-card-scroll"));
  const saved = {
    rootOverflow: root.style.overflow,
    rootOverscroll: root.style.overscrollBehavior,
    bodyOverflow: body.style.overflow,
    bodyOverscroll: body.style.overscrollBehavior,
    scrollers: scrollers.map((element) => element.style.overflowY),
  };

  root.style.overflow = "hidden";
  root.style.overscrollBehavior = "none";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  scrollers.forEach((element) => {
    element.style.overflowY = "hidden";
  });

  const blockMove = (event: TouchEvent) => {
    if (keep && event.target instanceof Node && keep.contains(event.target)) return;
    event.preventDefault();
  };
  document.addEventListener("touchmove", blockMove, { passive: false });

  return () => {
    document.removeEventListener("touchmove", blockMove);
    root.style.overflow = saved.rootOverflow;
    root.style.overscrollBehavior = saved.rootOverscroll;
    body.style.overflow = saved.bodyOverflow;
    body.style.overscrollBehavior = saved.bodyOverscroll;
    scrollers.forEach((element, index) => {
      element.style.overflowY = saved.scrollers[index] ?? "";
    });
  };
}

/**
 * While `active`, reports the keyboard's top edge through `setInset` (the `bottom` of a
 * `position: fixed` line) and locks everything behind the line.
 */
export function useKeyboardDock(
  active: boolean,
  line: RefObject<HTMLElement | null>,
  setInset: (inset: number) => void,
) {
  useEffect(() => {
    if (!active) return;
    const unlock = lockBackground(line.current);
    const viewport = window.visualViewport;
    if (!viewport) return unlock;

    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // The page is locked; any pan iOS still applies is undone so nothing behind moves.
        if (viewport.offsetTop > 0) window.scrollTo(0, 0);
        const next = keyboardInset();
        if (next <= KEYBOARD_MIN_PX) return;
        rememberKeyboardPx(next);
        setInset(next);
      });
    };
    viewport.addEventListener("resize", follow);
    viewport.addEventListener("scroll", follow);
    follow();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", follow);
      viewport.removeEventListener("scroll", follow);
      unlock();
    };
  }, [active, line, setInset]);
}
