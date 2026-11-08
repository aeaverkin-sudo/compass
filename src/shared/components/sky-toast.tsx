"use client";

import { useEffect, useRef, useState } from "react";

type SkyToastProps = {
  text: string;
  onDone: () => void;
  /** How long it stays fully shown before the fade. */
  holdMs?: number;
};

const APPEAR_MS = 300;
const LEAVE_MS = 1500;

/** Centered sky plaque. It fades in, holds, then fades out. */
export function SkyToast({ text, onDone, holdMs = 1200 }: SkyToastProps) {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setShown(true));
    const fade = window.setTimeout(() => setLeaving(true), APPEAR_MS + holdMs);
    const done = window.setTimeout(() => doneRef.current(), APPEAR_MS + holdMs + LEAVE_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [holdMs]);

  return (
    <p
      className="pointer-events-none fixed top-1/2 left-1/2 z-[45] max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center t-body text-[var(--ink)]"
      style={{
        opacity: shown && !leaving ? 1 : 0,
        transition: leaving ? `opacity ${LEAVE_MS}ms ease` : `opacity ${APPEAR_MS}ms ease`,
      }}
    >
      {text}
    </p>
  );
}
