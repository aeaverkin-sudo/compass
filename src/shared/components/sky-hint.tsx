"use client";

import { useEffect, useRef, useState } from "react";

type SkyHintProps = {
  text: string;
  onDone: () => void;
};

/**
 * The same sky plaque as SkyToast. It stays until a tap anywhere.
 * The tap is not swallowed, so the thing under the finger still runs.
 */
export function SkyHint({ text, onDone }: SkyHintProps) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setShown(true));
    const close = () => doneRef.current();
    document.addEventListener("pointerdown", close, { capture: true, once: true, passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", close, { capture: true });
    };
  }, []);

  return (
    <p
      className="pointer-events-none fixed top-1/2 left-1/2 z-40 max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center t-body text-[var(--ink)]"
      style={{ opacity: shown ? 1 : 0, transition: shown ? "opacity 150ms ease" : "none" }}
    >
      {text}
    </p>
  );
}
