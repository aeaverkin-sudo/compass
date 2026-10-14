"use client";

import { useEffect, useRef, useState } from "react";

type SkyToastProps = {
  text: string;
  onDone: () => void;
  /** How long it stays fully shown before the fade. */
  holdMs?: number;
};

/** Centered sky plaque. It fades out over about two seconds. */
export function SkyToast({ text, onDone, holdMs = 200 }: SkyToastProps) {
  const [shown, setShown] = useState(true);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const fade = window.setTimeout(() => setShown(false), holdMs);
    const done = window.setTimeout(() => doneRef.current(), holdMs + 2000);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [holdMs]);

  return (
    <p
      className="pointer-events-none fixed top-1/2 left-1/2 z-40 max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center t-body text-[var(--ink)]"
      style={{ opacity: shown ? 1 : 0, transition: "opacity 2s ease" }}
    >
      {text}
    </p>
  );
}
