"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Measure an anchor once (while keyboard is closed) and keep its top for fixed positioning. */
export function useLockedAnchorTop(keyboardOpen: boolean) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (keyboardOpen) return;

    const measure = () => {
      const node = anchorRef.current;
      if (!node) return;
      setTop((prev) => prev ?? node.getBoundingClientRect().top);
    };

    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [keyboardOpen]);

  return { anchorRef, top };
}
