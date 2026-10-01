"use client";

import { useEffect, useRef, useState } from "react";

type SkyToastProps = {
  text: string;
  onDone: () => void;
};

/** Centered sky plaque. It fades out over about two seconds. */
export function SkyToast({ text, onDone }: SkyToastProps) {
  const [shown, setShown] = useState(true);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const fade = window.setTimeout(() => setShown(false), 200);
    const done = window.setTimeout(() => doneRef.current(), 2200);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, []);

  return (
    <p
      className="pointer-events-none fixed top-1/2 left-1/2 z-40 max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center text-[16px] font-normal leading-snug text-[#111]"
      style={{ opacity: shown ? 1 : 0, transition: "opacity 2s ease" }}
    >
      {text}
    </p>
  );
}
