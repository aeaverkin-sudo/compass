"use client";

import { useEffect, useState } from "react";

/** Distance from the bottom of the layout viewport up to the top of the keyboard. */
function keyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
}

function pinPage() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/**
 * While `active`, returns the keyboard's real top edge (the `bottom` of a `position: fixed`
 * line) and pins the page, since iOS scrolls it toward the focused field.
 */
export function useKeyboardDock(active: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    const sync = () => {
      pinPage();
      setInset(keyboardInset());
    };
    sync();
    window.addEventListener("scroll", pinPage, { passive: true });
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("scroll", pinPage);
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      pinPage();
      setInset(0);
    };
  }, [active]);

  return inset;
}
