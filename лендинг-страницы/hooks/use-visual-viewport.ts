"use client";

import { useEffect, useState } from "react";

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
export function useVisualViewport() {
  const [state, setState] = useState<VisualViewportState>({
    offsetTop: 0,
    height: 0,
    keyboardOpen: false,
    keyboardInset: 0,
  });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => {
      const keyboardInset = Math.max(
        0,
        layoutHeight() - viewport.height - viewport.offsetTop,
      );
      setState({
        offsetTop: viewport.offsetTop,
        height: viewport.height,
        keyboardOpen: keyboardInset > 50,
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
