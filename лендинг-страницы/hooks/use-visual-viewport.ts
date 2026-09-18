"use client";

import { useEffect, useState } from "react";

type VisualViewportState = {
  offsetTop: number;
  keyboardOpen: boolean;
};

/** Track iOS visual viewport — keyboard shrinks it even when layout height stays fixed. */
export function useVisualViewport() {
  const [state, setState] = useState<VisualViewportState>({
    offsetTop: 0,
    keyboardOpen: false,
  });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => {
      setState({
        offsetTop: viewport.offsetTop,
        keyboardOpen: viewport.height < window.innerHeight * 0.85,
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
