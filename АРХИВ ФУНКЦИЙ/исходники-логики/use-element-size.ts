"use client";

import { useEffect, useRef, useState } from "react";

export function useElementHeight<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setHeight(el.getBoundingClientRect().height);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // Re-measure when card content or mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, height };
}
