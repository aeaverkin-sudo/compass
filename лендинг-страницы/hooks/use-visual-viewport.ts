"use client";

import { useEffect, useRef, useState } from "react";

type VisualViewportState = {
  offsetTop: number;
  height: number;
  keyboardOpen: boolean;
  /** Distance from layout viewport bottom to visual viewport bottom (keyboard height). */
  keyboardInset: number;
};

function layoutHeight() {
  return document.documentElement.clientHeight || window.innerHeight;
}

/** Track iOS visual viewport — keyboard shrinks it even when layout height stays fixed. */
const KEYBOARD_OPEN_INSET_PX = 80;
const KEYBOARD_CLOSE_INSET_PX = 40;

export function useVisualViewport() {
  const [state, setState] = useState<VisualViewportState>({
    offsetTop: 0,
    height: 0,
    keyboardOpen: false,
    keyboardInset: 0,
  });
  const keyboardOpenRef = useRef(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => {
      const keyboardInset = Math.max(
        0,
        layoutHeight() - viewport.height - viewport.offsetTop,
      );
      if (keyboardInset > KEYBOARD_OPEN_INSET_PX) keyboardOpenRef.current = true;
      else if (keyboardInset < KEYBOARD_CLOSE_INSET_PX) keyboardOpenRef.current = false;

      setState({
        offsetTop: viewport.offsetTop,
        height: viewport.height,
        keyboardOpen: keyboardOpenRef.current,
        keyboardInset,
      });
    };

    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    sync();

    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  return state;
}
