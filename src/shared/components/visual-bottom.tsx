"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { rememberScreen, resetScreen, shouldRemeasure, writeScreenVars } from "@main/layout";

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

    const write = () => {
      frame = 0;
      writeScreenVars();
      rememberScreen();
      root.classList.add("compass-band-ready");
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(write);
    };

    // A shorter viewport is the keyboard. A taller one is the full screen, and it still counts.
    const onViewport = () => {
      if (!shouldRemeasure(root.classList.contains("compass-settled"))) return;
      schedule();
    };
    const onTurn = () => {
      resetScreen();
      schedule();
    };

    write();
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);
    window.addEventListener("orientationchange", onTurn);
    window.addEventListener("resize", onViewport);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      window.removeEventListener("orientationchange", onTurn);
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
