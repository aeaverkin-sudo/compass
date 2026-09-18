"use client";

import { useEffect, useState } from "react";

/** iOS shifts the visual viewport when the keyboard opens — use offsetTop to compensate fixed UI. */
export function useVisualViewportOffset() {
  const [offsetTop, setOffsetTop] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => setOffsetTop(viewport.offsetTop);

    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    sync();

    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  return offsetTop;
}
