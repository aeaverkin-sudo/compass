"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { writeScreenVars } from "@main/layout";

/**
 * The head script has already sized the shell. This repeats that measure
 * after navigation and when the phone turns. The keyboard does not resize it.
 */
export function VisualBottom() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const write = () => {
      frame = 0;
      writeScreenVars();
      root.classList.add("compass-band-ready");
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(write);
    };

    write();
    window.addEventListener("orientationchange", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("orientationchange", schedule);
    };
  }, [pathname]);

  return (
    <style>{`
      .compass-sky-band { visibility: hidden; transition: none; }
      html.compass-band-ready .compass-sky-band { visibility: visible; }
    `}</style>
  );
}
