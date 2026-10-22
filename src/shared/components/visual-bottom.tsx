"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { writeScreenVars } from "@main/layout";

/**
 * The head script has already sized the shell. This repeats that measure
 * after navigation and when the visible viewport moves.
 * The band stays hidden until this runs, which is before the first paint.
 */
export function VisualBottom() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.documentElement;
    // / and /main stay unsettled until the portfolio measures. Any other arrival releases motion.
    if (pathname !== "/" && pathname !== "/main" && !pathname.startsWith("/main/")) {
      root.classList.add("compass-settled");
    }
    let frame = 0;
    let width = window.innerWidth;

    const write = () => {
      frame = 0;
      writeScreenVars();
      width = window.innerWidth;
      root.classList.add("compass-band-ready");
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(write);
    };

    // After the full-screen measure is frozen, a keyboard resize keeps the same
    // width and must not write a shorter --app-h. A turn still measures.
    const onViewport = () => {
      if (root.classList.contains("compass-settled") && window.innerWidth === width) return;
      schedule();
    };

    write();
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("resize", onViewport);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("resize", onViewport);
    };
  }, [pathname]);

  return (
    <style>{`
      .compass-sky-band { visibility: hidden; transition: none; }
      html.compass-band-ready .compass-sky-band { visibility: visible; }
    `}</style>
  );
}
